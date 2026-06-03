import examplesYaml from "./examples.yml";

export interface Example {
    title: string;
    code: string;
    selections?: [number, number][];
    errorMessage?: string;
    show?: Record<string, boolean>;
}

export const examples = examplesYaml as Record<string, Record<string, Example[]>>;
