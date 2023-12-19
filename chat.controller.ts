import { ChatOpenAI } from "langchain/chat_models/openai";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
    AIMessagePromptTemplate,
    HumanMessagePromptTemplate,
} from "langchain/prompts";
import { RunnableSequence } from "langchain/schema/runnable";
import { formatDocumentsAsString } from "langchain/util/document";
import { StringOutputParser } from "langchain/schema/output_parser";
import { BufferMemory } from "langchain/memory";
import { Request, Response, NextFunction } from "express";
import { getRelevantDocsFromRetriver } from "../utils/chromadbFunctions";
import {
    checkReadblity,
    documentationAnalyser,
    eachFunctionAnalyser,
    findBugs,
    progressAnalyser,
} from "../utils/runners";
import createHttpError from "http-errors";

// Constants
const openAIApiKey = <string>(<unknown>process.env.OPEN_AI_API_KEY);

export const model = new ChatOpenAI({
    modelName: "gpt-3.5-turbo-1106",
    openAIApiKey: openAIApiKey,
}).pipe(new StringOutputParser());

export const memory = new BufferMemory({
    returnMessages: true, // Return stored messages as instances of `BaseMessage`
    memoryKey: "chat_history", // This must match up with our prompt template input variable.
});

const questionGeneratorTemplate = ChatPromptTemplate.fromMessages([
    AIMessagePromptTemplate.fromTemplate(
        "Given the following conversation about a codebase and a follow up question, rephrase the follow up question to be a standalone question."
    ),
    new MessagesPlaceholder("chat_history"),
    AIMessagePromptTemplate.fromTemplate(`Follow Up Input: {question} Standalone question:`),
]);

const combineDocumentsPrompt = ChatPromptTemplate.fromMessages([
    AIMessagePromptTemplate.fromTemplate(
        "Use the following pieces of context to answer the question at the end. If you don't know the answer, try to make up answers based on the provided code.\n\n{context}\n\n"
    ),
    new MessagesPlaceholder("chat_history"),
    HumanMessagePromptTemplate.fromTemplate("Question: {question}"),
]);

export const newChatInstance = async (req: Request, res: Response, NextFunction: NextFunction) => {
    try {
        const combineDocumentsChain = RunnableSequence.from([
            {
                question: (output: string) => output,
                chat_history: async () => {
                    const { chat_history } = await memory.loadMemoryVariables({});
                    return chat_history;
                },
                context: async (output: string) => {
                    const relevantDocs = await getRelevantDocsFromRetriver(
                        output,
                        req.query.project_id as string
                    );
                    return formatDocumentsAsString(relevantDocs);
                },
            },
            combineDocumentsPrompt,
            model,
            new StringOutputParser(),
        ]);
        const conversationalQaChain = RunnableSequence.from([
            {
                question: (i: { question: string }) => i.question,
                chat_history: async () => {
                    const { chat_history } = await memory.loadMemoryVariables({});
                    return chat_history;
                },
            },
            questionGeneratorTemplate,
            model,
            new StringOutputParser(),
            combineDocumentsChain,
        ]);
        let result;
        const question = req.query.question as string;
        if (req.query.type === "bugs") {
            console.log("L-89 running bugs");
            result = await findBugs(question, req.query.project_id as string);
        } else if (req.query.type === "read") {
            result = await checkReadblity(question, req.query.project_id as string);
        } else if (req.query.type === "docs") {
            const functionName = req.query.functionName as string;
            const description = req.query.functionDescription as string;
            const timeTaken = req.query.timeTaken as string;
            const bugs = req.query.bugs as string;
            const devloperName = req.query.devloperName as string;
            result = await documentationAnalyser(
                {
                    functionName,
                    description,
                    timeTaken,
                    bugs,
                    devloperName,
                },
                req.query.project_id as string
            );
        } else if (req.query.type === "progress") {
            result = await progressAnalyser(req.query.project_id as string);
        } else if (req.query.type === "complete") {
            // console.log("L-111 Chat Controller");
            result = await eachFunctionAnalyser(req.query.project_id as string);
        } else {
            result = await conversationalQaChain.invoke({
                question,
            });
        }
        // console.log("Complete analysis completed");
        return res.send(result);
    } catch (err) {
        console.log(err);
        return res.send("Internal Server Error").status(500);
    }
};
