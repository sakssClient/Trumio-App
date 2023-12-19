import dotenv from "dotenv";
dotenv.config();
import { NextFunction, Response, Request } from "express";
import { genrateWebHook, getAllUserRepos, getGitHubUserData } from "../utils/gihubAPICollections";
import Model_ClientProj from "../models/clientProjModel";
import Model_ProjectAuthKey from "../models/projectAuthKeyModel";
import Model_ProjectDocs from "../models/projectDocs";
import Model_UserOrg from "../models/userOrgModel";
import createHttpError, { UnknownError } from "http-errors";
import mongoose, { Mongoose, Schema } from "mongoose";

const addRepoToClientProjs = async (
    authToken: string,
    githubUserName: string,
    repoName: string
) => {
    const findProject = await Model_ProjectAuthKey.findOne({ projectName: repoName });
    if (findProject) {
        return console.log("Project already exists. No action taken");
    } else {
        const newProject = await Model_ProjectAuthKey.create({
            projectName: repoName,
            authToken: authToken,
        });
        const findUser = await Model_ClientProj.findOne({ clientGithubUserName: githubUserName });
        if (findUser) {
            await findUser.updateOne({
                $addToSet: { projects: { Name: repoName, projectID: newProject.id } },
            });
            await findUser.save();
            const newProjectDoc = await Model_ProjectDocs.create({
                projectID: newProject.id,
                docs: [],
                clientReq: "",
                name: repoName,
            });
            console.log("New project added for client: ", githubUserName);
        } else {
            return console.log(`No such user exists ${githubUserName}`);
        }
    }
    return;
};

const makeNewClient = async (authToken: string) => {
    const currUserDetails = await getGitHubUserData(authToken);
    const userName = currUserDetails.login;
    const isPresent = await Model_ClientProj.findOne({ clientGithubUserName: userName });
    if (!isPresent) {
        const newUser = await Model_ClientProj.create({
            clientGithubUserName: userName,
            clientAuthToken: authToken,
            projects: [
                {
                    Name: "sakssClient/Test3",
                    projectID: "65679b8ba2415895a7ae0f95",
                },
            ],
        });
        if (newUser) {
            console.log("New Client Genrated Successfully");
        }
    }
    return;
};

export const listClientProjects = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    await makeNewClient(authToken);
    const userData = await getGitHubUserData(authToken);
    const userName = userData.login;
    const existingUser = await Model_ClientProj.findOne({ clientGithubUserName: userName });
    if (existingUser) {
        return res.send({ Projects: existingUser.projects }).status(200);
    } else {
        return next(createHttpError(404, "User not found"));
    }
};

export const newUser = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    console.log(authToken);
    const userData = await getGitHubUserData(authToken);
    const userName = userData.login;
    const existingUser = await Model_UserOrg.findOne({ userGithubUserName: userName });
    if (existingUser) {
        return res.send({ Details: existingUser, Token: req.cookies });
    } else {
        const newUser = await Model_UserOrg.create({
            userGithubUserName: userName,
            projects: ["65679b8ba2415895a7ae0f95"],
            score: 0,
        });
        return res.send({ Details: newUser });
    }
};

export const listUserProjects = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    await makeNewClient(authToken);
    const userData = await getGitHubUserData(authToken);
    const userName = userData.login;
    const existingUser = await Model_UserOrg.findOne({ userGithubUserName: userName });
    if (existingUser) {
        return res.send({ Projects: existingUser.projects }).status(200);
    } else {
        return next(createHttpError(404, "User not found"));
    }
};

export const addUserProjects = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const projectID = req.body.projectID;
    const userName = userData.login;
    const existingUser = await Model_UserOrg.findOne({ userGithubUserName: userName });
    if (existingUser) {
        const updatedProjects = await existingUser.updateOne({
            $addToSet: { projects: projectID },
        });
        res.send({ Message: "Success", UpdatedDetails: updatedProjects });
    } else {
        return next(createHttpError(404, "User not found"));
    }
};

export const deleteUserProject = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const projectID = req.body.projectID;
    const userName = userData.login;
    const existingUser = await Model_UserOrg.findOne({ userGithubUserName: userName });
    if (existingUser) {
        const updatedProjects = await existingUser.updateOne({
            $pull: { projects: projectID },
        });
        res.send({ Message: "Success", UpdatedDetails: updatedProjects });
    } else {
        return next(createHttpError(404, "User not found"));
    }
};

export const repoListHandler = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const userName = userData.login;
    const userRepo = await getAllUserRepos(authToken, userName);
    return res.send({ Repos: userRepo, Cookie: req.cookies });
};

export const genrateWebHookHandler = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const repoName = req.query.repoName;
    const userData = await getGitHubUserData(authToken);
    const userName = userData.login;
    const webHookGenrateResult = await genrateWebHook(authToken, repoName as string);
    if (webHookGenrateResult.status === 201) {
        console.log(`Webhook for repo ${repoName} successfully created`);
        await addRepoToClientProjs(authToken, userName, repoName as string);
        return res.send({ Message: "Success" });
    } else {
        return res.send({ Message: `Some Error occured. ${webHookGenrateResult.status}` });
    }
};

export const getClientRequirements = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const clientGithubUserName = userData.login;
    const projectId = req.query.projectId as string;
    const findClient = await Model_ClientProj.findOne({
        clientGithubUserName: clientGithubUserName,
    });
    if (findClient) {
        const clientProjects: any[] = <any[]>(<unknown>findClient.projects);
        if (
            clientProjects
                .map((ele) => {
                    return ele.projectID.toString();
                })
                .includes(projectId)
        ) {
            const projectDocs = await Model_ProjectDocs.findOne({ projectID: projectId });
            if (projectDocs) {
                return res
                    .send({ Message: "Success", ClientRequirements: projectDocs.clientReq })
                    .status(200);
            } else {
                return next(createHttpError(404, "Project docs donot exist"));
            }
        } else {
            return next(createHttpError(403, "No such project for client exists"));
        }
    } else {
        return next(createHttpError(403, "No such client found"));
    }
};

export const newClientRequirements = async (req: Request, res: Response, next: NextFunction) => {
    const requirements = req.body.requirements;
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const clientGithubUserName = userData.login;
    const projectId = req.query.projectId as string;
    const findClient = await Model_ClientProj.findOne({
        clientGithubUserName: clientGithubUserName,
    });
    if (findClient) {
        const clientProjects: any[] = <any[]>(<unknown>findClient.projects);
        if (
            clientProjects
                .map((ele) => {
                    return ele.projectID.toString();
                })
                .includes(projectId)
        ) {
            const newProjectDoc = await Model_ProjectDocs.create({
                projectID: projectId,
                docs: [],
                clientReq: requirements,
                name: projectId,
            });
            return res.send({ Message: "Success" }).status(200);
        } else {
            return next(createHttpError(403, "No such project for client exists"));
        }
    } else {
        return next(createHttpError(403, "No such client found"));
    }
};

export const updateClientRequirements = async (req: Request, res: Response, next: NextFunction) => {
    const updatedRequirements = req.body.requirements;
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const clientGithubUserName = userData.login;
    const projectId = req.query.projectId as string;
    const findClient = await Model_ClientProj.findOne({
        clientGithubUserName: clientGithubUserName,
    });
    if (findClient) {
        const clientProjects: any[] = <any[]>(<unknown>findClient.projects);
        if (
            clientProjects
                .map((ele) => {
                    return ele.projectID.toString();
                })
                .includes(projectId)
        ) {
            const currProjectDocs = await Model_ProjectDocs.findOne({
                projectID: projectId,
            });
            if (currProjectDocs) {
                const updatedProjectDocs = await currProjectDocs.updateOne({
                    $set: { clientReq: updatedRequirements },
                });
                return res.send({ Mesage: "Success" }).status(200);
            } else {
                return next(createHttpError(404, "Project Docs donot exist"));
            }
        } else {
            return next(createHttpError(403, "No such project for client exists"));
        }
    } else {
        return next(createHttpError(403, "No such client exists"));
    }
};

export type UserDocumentation = {
    id: string;
    function_name: string;
    function_description: string;
    time_taken: string;
    bugs: string;
    username: string;
};

export const getUserDocs = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const userGithubUserName = userData.login;
    const projectId = req.query.projectId as string;
    const findUser = await Model_UserOrg.findOne({
        userGithubUserName: userGithubUserName,
    });
    if (findUser) {
        const userProjects = <string[]>(<unknown>findUser.projects);
        if (userProjects.includes(projectId)) {
            const existingDocs = await Model_ProjectDocs.findOne({ projectID: projectId });
            const userDocs = <UserDocumentation[]>(<unknown>existingDocs?.docs);
            return res
                .send({
                    Message: "Success",
                    Docs: userDocs.map((ele) => {
                        if (ele.username === userGithubUserName) {
                            return ele;
                        }
                    }),
                })
                .status(200);
        } else {
            return next(createHttpError(403, "User not in this project"));
        }
    } else {
        return next(createHttpError(403, "No such user exists"));
    }
};

export const addUserDocs = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const userGithubUserName = userData.login;
    const projectId = req.query.projectId as string;
    const newDocs: UserDocumentation[] = req.body.doc;
    const findUser = await Model_UserOrg.findOne({
        userGithubUserName: userGithubUserName,
    });
    if (findUser) {
        const userProjects = <string[]>(<unknown>findUser.projects);
        if (userProjects.includes(projectId)) {
            const existingDocs = await Model_ProjectDocs.findOne({ projectID: projectId });
            console.log(existingDocs);
            if (existingDocs) {
                console.log(newDocs);
                const updatedDocs = await existingDocs.updateOne({ $push: { docs: newDocs } });
                console.log(updatedDocs);
                return res.send({ Message: "Success" }).status(200);
            } else {
                return next(createHttpError(404, "No project requirements exist"));
            }
        }
    } else {
        return next(createHttpError(403, "No such user exists"));
    }
};

export const updateUserDocs = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const userGithubUserName = userData.login;
    const projectId = new Schema.ObjectId(req.query.projectId as string);
    const newDocs: UserDocumentation[] = JSON.parse(req.body).userDocs;
    const findUser = await Model_UserOrg.findOne({
        userGithubUserName: userGithubUserName,
    });
    if (findUser) {
        const userProjects = <Schema.Types.ObjectId[]>(<unknown>findUser.projects);
        if (userProjects.includes(projectId)) {
            const existingDocs = await Model_ProjectDocs.findOne({ projectID: projectId });
            if (existingDocs) {
                const userDocs = <UserDocumentation[]>(<unknown>existingDocs.docs);
                if (userDocs) {
                    const updatedIds = newDocs.map((ele) => {
                        return ele.id;
                    });
                    const newUserDocs = userDocs.map((oldDoc) => {
                        if (updatedIds.includes(oldDoc.id)) {
                            return newDocs.filter((newDoc) => {
                                newDoc.id === oldDoc.id;
                            })[0];
                        } else {
                            return oldDoc;
                        }
                    });
                    existingDocs.updateOne({ $set: { docs: newUserDocs } });
                    return res.send({ Message: "Success" }).status(200);
                } else {
                    return next(createHttpError(404, "User documentation not found"));
                }
            } else {
                return next(createHttpError(404, "No project requirements exist"));
            }
        } else {
            return next(createHttpError(403, "User not in this project"));
        }
    } else {
        return next(createHttpError(403, "No such user exits"));
    }
};

export const deleteUserDocs = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const userGithubUserName = userData.login;
    const projectId = new Schema.ObjectId(req.query.projectId as string);
    const delID = req.query.delId as string;
    const findUser = await Model_UserOrg.findOne({
        userGithubUserName: userGithubUserName,
    });
    if (findUser) {
        const userProjects = <Schema.Types.ObjectId[]>(<unknown>findUser.projects);
        if (userProjects.includes(projectId)) {
            const existingDocs = await Model_ProjectDocs.findOne({ projectID: projectId });
            if (existingDocs) {
                const userDocs = <UserDocumentation[]>(<unknown>existingDocs.docs);
                if (userDocs) {
                    const newUserDocs = userDocs.filter((oldDoc) => {
                        return oldDoc.id !== delID;
                    });
                    existingDocs.updateOne({ $set: { docs: newUserDocs } });
                    return res.send({ Message: "Success" }).status(200);
                } else {
                    return next(createHttpError(404, "User documentation not found"));
                }
            } else {
                return next(createHttpError(404, "No project requirements exist"));
            }
        } else {
            return next(createHttpError(403, "User not in this project"));
        }
    } else {
        return next(createHttpError(403, "No such user exits"));
    }
};

export const getProjcetDetails = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const userGithubUserName = userData.login;
    const projectId = req.query.projectId as string;
    const findUser = await Model_UserOrg.findOne({
        userGithubUserName: userGithubUserName,
    });
    if (findUser) {
        const userProjects = <string[]>(<unknown>findUser.projects);
        if (userProjects.includes(projectId)) {
            const projectDetails = await Model_ProjectDocs.findOne({ projectID: projectId });
            return res.send(projectDetails).status(200);
        }
    } else {
        return next(createHttpError(403, "No such user exists"));
    }
};

const checkProjectForUserExists = async (userGithubName: string, project_id: string) => {
    const findUser = await Model_UserOrg.findOne({
        userGithubUserName: userGithubName,
    });
    if (findUser) {
        const userProjects = <string[]>(<unknown>findUser.projects);
        console.log(userProjects, project_id);
        if (userProjects.includes(project_id)) {
            return true;
        }
    }
    return false;
};

export const getProjectName = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const userGithubUserName = userData.login;
    const projectId = req.query.projectId as string;
    if (await checkProjectForUserExists(userGithubUserName, projectId)) {
        const projDets = await Model_ProjectAuthKey.findById(projectId);
        return res.send({ name: projDets?.projectName }).status(200);
    } else {
        return next(createHttpError(403, "Project not exists for user"));
    }
};

const clientProjChecker = async (userName: string, projectId: string) => {
    const projs = await Model_ClientProj.findOne({ clientGithubUserName: userName });
    const clientProjs = <any[]>(<unknown>projs?.projects);
    console.log(
        projectId,
        clientProjs.map((ele) => {
            return ele.projectID.toString();
        })
    );
    if (
        clientProjs
            .map((ele) => {
                return ele.projectID.toString();
            })
            .includes(projectId)
    ) {
        return true;
    }
    return false;
};

export const openGetProjectDetails = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const clinetGithubUserName = userData.login;
    const projectId = req.query.projectId as string;
    if (await clientProjChecker(clinetGithubUserName, projectId)) {
        const projectDetails = await Model_ProjectDocs.findOne({ projectID: projectId });
        return res.send(projectDetails).status(200);
    } else {
        return res.send(createHttpError(403, "Project does not exist for client")).status(403);
    }
};

export const clientGetProjectName = async (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.body.authToken.data;
    const userData = await getGitHubUserData(authToken);
    const userGithubUserName = userData.login;
    const projectId = req.query.projectId as string;
    if (await clientProjChecker(userGithubUserName, projectId)) {
        const projDets = await Model_ProjectAuthKey.findById(projectId);
        return res.send({ name: projDets?.projectName }).status(200);
    } else {
        return next(createHttpError(403, "Project not exists for client"));
    }
};
