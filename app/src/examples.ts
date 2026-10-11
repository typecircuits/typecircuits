import examplesYaml from "./examples.yml";

export interface Example {
    title: string;
    code: string;
    selections?: [number, number][];
    hiddenNodes?: string[];
    errorMessage?: string;
    show?: Record<string, boolean>;
}

export const examples = examplesYaml as Record<string, Record<string, Example[]>>;
