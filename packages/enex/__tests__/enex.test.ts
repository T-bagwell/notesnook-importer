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

import tap from "tap";
import { Enex } from "../index";
import fs from "fs";
import path from "path";
import { fdir } from "fdir";

tap.test("enex should be parsed correctly", async () => {
  const dataDirectoryPath = path.join(__dirname, "data");
  const enexFiles = await new fdir()
    .withFullPaths()
    .filter((p) => p.endsWith(".enex"))
    .crawl(dataDirectoryPath)
    .withPromise();
  for (const filePath of <string[]>enexFiles) {
    const enexFile = fs.readFileSync(filePath, "utf-8");
    const enex = new Enex(enexFile);
    tap.matchSnapshot(toJSON(enex), path.basename(filePath));
    enex.notes.forEach((note) => {
      note.resources?.forEach((res) => {
        tap.ok(res.attributes?.hash);
        tap.ok(note.content.raw.indexOf(res.attributes?.hash!) > -1);
      });
    });
  }
});

function toJSON(thisArg: any) {
  const proto = Object.getPrototypeOf(thisArg);
  const jsonObj: any = Object.assign({}, thisArg);

  Object.entries(Object.getOwnPropertyDescriptors(proto))
    .filter(([key, descriptor]) => typeof descriptor.get === "function")
    .map(([key, descriptor]) => {
      if (descriptor && key[0] !== "_") {
        try {
          const val = (thisArg as any)[key];
          if (val && Array.isArray(val)) {
            const array = [];
            for (const item of val) {
              if (typeof item === "object") array.push(toJSON(item));
              else array.push(item);
            }
            jsonObj[key] = array;
          } else if (val && !(val instanceof Date) && typeof val === "object") {
            jsonObj[key] = toJSON(val);
          } else {
            jsonObj[key] = val;
          }
        } catch (error) {
          console.error(`Error calling getter ${key}`, error);
        }
      }
    });

  return jsonObj;
}
