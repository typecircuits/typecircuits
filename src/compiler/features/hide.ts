import { node, Node, type Feature, type Selector } from "../index";

export interface HideOptions {
    transparent: Selector<Node>[];
    atomic: Selector<Node>[];
}

export const hide =
    (options: HideOptions): Feature =>
    (context) => {
        context.select(options.transparent, (node) => {
            context.transparent(node);
        });

        context.select(options.atomic, (node) => {
            context.atomic(node);
        });
    };

export const hideDefault = () =>
    hide({ transparent: [node(undefined), node("ERROR")], atomic: [] });
