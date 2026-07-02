import { Node, type Feature, type Selector } from "../index";

export interface ReplaceOptions {
    replace: Selector<[Node, Node]>[];
}

export const replace =
    (options: ReplaceOptions): Feature =>
    (context) => {
        context.select(options.replace, ([from, to]) => {
            context.replace(from, to);
        });
    };
