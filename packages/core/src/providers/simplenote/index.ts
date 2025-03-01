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

import { ContentType, Note } from "../../models/note";
import { SimplenoteExport } from "./types";
import {
  IFileProvider,
  iterate,
  ProviderResult,
  ProviderSettings
} from "../provider";
import { File } from "../../utils/file";
import { markdowntoHTML, textToHTML } from "../../utils/to-html";

export class Simplenote implements IFileProvider {
  public type = "file" as const;
  public supportedExtensions = [".json"];
  public validExtensions = [".txt", ...this.supportedExtensions];
  public version = "1.0.0";
  public name = "Simplenote";

  async process(
    files: File[],
    _settings: ProviderSettings
  ): Promise<ProviderResult> {
    return iterate(this, files, async (file, notes, errors) => {
      const data = file.text;
      const { activeNotes } = <SimplenoteExport>JSON.parse(data);
      if (!activeNotes) return false;

      for (const activeNote of activeNotes) {
        if (
          !activeNote.content ||
          !activeNote.creationDate ||
          !activeNote.lastModified
        ) {
          errors.push(
            new Error(
              `Invalid note. content, creationDate & lastModified properties are required. (File: ${file.name})`
            )
          );
          continue;
        }

        const lines = activeNote.content.split(/\r\n|\n/);
        const title = lines[0];
        const content = activeNote.markdown
          ? markdowntoHTML(lines.join("\n"))
          : textToHTML(lines.join("\n"));

        const note: Note = {
          title: title || "Untitled note",
          dateCreated: new Date(activeNote.creationDate).getTime(),
          dateEdited: new Date(activeNote.lastModified).getTime(),
          pinned: activeNote.pinned,
          tags: activeNote.tags,
          content: {
            type: ContentType.HTML,
            data: content
          }
        };

        notes.push(note);
      }

      return true;
    });
  }
}
