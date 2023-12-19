import dotenv from "dotenv";
dotenv.config();
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import { Response, Request } from "express";
import { createDocmentFromText, genrateEmbeddings } from "../utils/genrateEmbeddings";
import {
    blobContentReader,
    fileFilter,
    getFilesInCommit,
    getGitHubUserData,
    getLatestCommitLink,
} from "../utils/gihubAPICollections";
import projectAuthModel from "../models/projectAuthKeyModel";
import { deleteFromDB, insertIntoVectorDB } from "../utils/chromadbFunctions";

const compareAndEmbedFiles = async (authToken: string, project_id: string, compare_url: string) => {
    const currProjectName = compare_url.split("/").slice(4, 6); // [username,reponame];
    const currProjDetails = await projectAuthModel.findOne({
        projectName: `${currProjectName[0]}/${currProjectName[1]}`,
    });
    if (currProjDetails) {
        const { modifiedFiles, newFiles, removedFiles } = await fileFilter(
            currProjDetails?.authToken as string,
            compare_url
        );
        const modifiedEmbedDocs = await Promise.all(
            modifiedFiles.map(async (ele) => {
                if (ele.changes >= 5) {
                    const text = await blobContentReader(authToken, ele.contents_url);
                    return await createDocmentFromText(text, ele.filename, project_id);
                }
            })
        );
        const addedEmbedDocs = await Promise.all(
            newFiles.map(async (ele) => {
                if (ele.changes >= 5) {
                    const text = await blobContentReader(authToken, ele.contents_url);
                    return await createDocmentFromText(text, ele.filename, project_id);
                }
            })
        );
        if (modifiedEmbedDocs.length > 0) {
            // console.log("Modifeid Data", modifiedData);
            // await updateEmbeddings(modifiedData[0] as any);
            console.log(modifiedEmbedDocs.length);
            return await Promise.all(
                modifiedEmbedDocs.map(async (ele) => {
                    insertIntoVectorDB(ele as any);
                })
            );
        }
        if (addedEmbedDocs.length > 0) {
            // console.log("Added Data", addedEmbedDocs[0]);
            // await newEmbeddings(addedData[0] as any);
            console.log(addedEmbedDocs.length);
            return await Promise.all(
                addedEmbedDocs.map(async (ele) => {
                    insertIntoVectorDB(ele as any);
                })
            );
        }
        if (removedFiles.length > 0) {
            // console.log("Removed Data", removedData);
            // await deleteEmbeddings(removedData);
            const res = await Promise.all(
                removedFiles.map(async (ele) => {
                    return await deleteFromDB(ele.filename, project_id);
                    // console.log(ele);
                })
            );
        }
    }
    return;
};

export const compareAndUpdateEmbeddingsHandler = async (req: Request, res: Response) => {
    if (req.headers["x-github-event"] === "ping") {
        return res.send({ Mesage: "Ping Event" });
    }
    let compare_url: string = req.body.repository.compare_url;
    const compare: string = req.body.compare;
    const base_head = compare.split("/");
    // TODO implement cold start feature
    if (base_head[base_head.length - 1].includes("...")) {
        compare_url = compare_url.replace("{base}...{head}", base_head[base_head.length - 1]);
        const currProject = await projectAuthModel.findOne({
            projectName: req.body.repository.full_name,
        });
        if (currProject?.authToken) {
            await compareAndEmbedFiles(
                currProject.authToken,
                currProject._id.toString(),
                compare_url
            );
            return res.send({ Link: compare_url });
        }
    } else {
        const currProject = await projectAuthModel.findOne({
            projectName: req.body.repository.full_name,
        });
        const authToken = currProject?.authToken as string;
        const latestCommitLink = await getLatestCommitLink(
            authToken,
            req.body.repository.full_name
        );
        console.log("Latest Commit Link : ", latestCommitLink);
        if (latestCommitLink != "") {
            const filesInCommit = await getFilesInCommit(authToken, latestCommitLink);
            
        }
    }
    return res.send({ Error: "Project does not exist" });
};
