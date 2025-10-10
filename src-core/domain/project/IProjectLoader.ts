import { Project } from "@/src-core/persistence/ProjectRepository.ts";
import { IFileWriter } from "./IFileWriter.ts";
import { IMd5Service } from "../md5/IMd5Service.ts";

export interface IProjectLoader {
    loadProject(projectDir: FileSystemDirectoryHandle, fileWriter: IFileWriter, md5Service: IMd5Service): Promise<Project | null>;
}
