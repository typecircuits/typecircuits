import type { Compiler } from "../compiler";
import type { Extension } from "@codemirror/state";
import { javascriptLanguage } from "./javascript";
import { pythonLanguage } from "./python";
import { javaLanguage } from "./java";
import { csharpLanguage } from "./csharp";
import { kotlinLanguage } from "./kotlin";

export interface Language<T> {
    name: string;
    editorExtensions?: () => Promise<Extension[]>;
    parse: (code: string) => Promise<T | undefined>;
    compile: (parsed: T, compiler: Compiler) => Promise<void>;
}

export const allLanguages = [
    javascriptLanguage,
    pythonLanguage,
    javaLanguage,
    csharpLanguage,
    kotlinLanguage,
];

export { embeddedLanguage } from "./embedded";

export const getLanguage = (name: string): Language<any> | undefined =>
    allLanguages.find((language) => language.name === name);
