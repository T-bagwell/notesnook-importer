/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2022 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { ContentType, Note, Notebook } from "../../models/note";
import { File } from "../../utils/file";
import {
  IFileProvider,
  iterate,
  ProviderResult,
  ProviderSettings
} from "../provider";
import { parse } from "node-html-parser";
import {
  NoteEntity,
  FolderEntity,
  TagEntity,
  NoteTagEntity,
  ResourceEntity
} from "./types";
import { Attachment, attachmentToHTML } from "../../models/attachment";
import { HTMLRootElement } from "node-html-parser/dist/nodes/html";
import { IHasher } from "../../utils/hasher";
import { unserialize } from "./helpers";
import { ModelType } from "./types";
import { markdowntoHTML } from "../../utils/to-html";

type JoplinData = {
  notes: NoteEntity[];
  noteTags: NoteTagEntity[];
  folders: FolderEntity[];
  tags: TagEntity[];
  resources: ResourceEntity[];
};

export class Joplin implements IFileProvider {
  public type = "file" as const;
  public supportedExtensions = [".jex", ".md"];
  public validExtensions = [...this.supportedExtensions];
  public version = "1.0.0";
  public name = "Joplin";

  async process(
    files: File[],
    settings: ProviderSettings
  ): Promise<ProviderResult> {
    const data: JoplinData = {
      folders: [],
      noteTags: [],
      notes: [],
      resources: [],
      tags: []
    };
    const notes: Note[] = [];
    await iterate(this, files, async (file) => {
      const item = await unserialize(file.text);
      switch (item.type_) {
        case ModelType.Note:
          data.notes.push(item);
          break;
        case ModelType.NoteTag:
          data.noteTags.push(item);
          break;
        case ModelType.Resource:
          data.resources.push(item);
          break;
        case ModelType.Tag:
          data.tags.push(item);
          break;
        case ModelType.Folder:
          data.folders.push(item);
          break;
      }
      return true;
    });

    for (const note of data.notes) {
      if (!note.id || !note.body) continue;
      const tags = this.resolveTags(note.id, data.tags, data.noteTags);
      const parentFolder = data.folders.find((a) => a.id === note.parent_id);
      const notebooks: Notebook[] = [];

      const html = markdowntoHTML(note.body);
      const document = parse(html);
      const title =
        note.title ||
        document.querySelector("h1,h2")?.textContent ||
        "Untitled note";

      const attachments = await this.resolveResources(
        data.resources,
        document,
        files,
        settings.hasher
      );

      if (parentFolder) {
        const notebook = this.resolveFolders(data.folders, parentFolder);
        if (notebook) notebooks.push(notebook);
      }

      notes.push({
        title,
        dateCreated: note.user_created_time || note.created_time,
        dateEdited: note.user_updated_time || note.updated_time,
        tags,
        attachments,
        notebooks,
        content: {
          data: document.outerHTML,
          type: ContentType.HTML
        }
      });
    }
    return { errors: [], notes };
  }

  private resolveTags(
    noteId: string,
    tags: TagEntity[],
    noteTags: NoteTagEntity[]
  ) {
    return tags
      .filter((t) => {
        return noteTags.some(
          (noteTag) => noteTag.tag_id === t.id && noteTag.note_id === noteId
        );
      })
      .map((tag) => tag.title!);
  }

  private async resolveResources(
    resources: ResourceEntity[],
    document: HTMLRootElement,
    files: File[],
    hasher: IHasher
  ) {
    const attachments: Attachment[] = [];
    for (const resource of resources) {
      if (!resource.id) continue;
      const element = document.querySelector(
        `[src=":/${resource.id}"],[href=":/${resource.id}"]`
      );
      if (!element) continue;
      const resourceFile = files.find((f) =>
        f.path?.includes(`resources/${resource.id!}`)
      );
      if (!resourceFile) continue;

      const dataHash = await hasher.hash(resourceFile.bytes);
      const attachment: Attachment = {
        data: resourceFile?.bytes,
        size: resourceFile?.bytes.length,
        hash: dataHash,
        filename: resource.title || resource.filename || dataHash,
        hashType: hasher.type,
        mime: resource.mime || "application/octet-stream"
      };
      attachments.push(attachment);
      element.replaceWith(attachmentToHTML(attachment));
    }
    return attachments;
  }

  private resolveFolders(
    folders: FolderEntity[],
    parentFolder: FolderEntity
  ): Notebook | null {
    let folder: FolderEntity | undefined = parentFolder;
    const path: string[] = [parentFolder.title!];
    while (folder?.parent_id) {
      folder = folders.find((f) => f.id === folder?.parent_id);
      if (!folder) break;
      path.push(folder.title!);
    }
    const topMost = path.pop();
    if (!topMost) return null;
    return {
      notebook: topMost,
      topic: path.reverse().join(".") || "All notes"
    };
  }
}
