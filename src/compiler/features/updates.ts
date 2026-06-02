import { Node, type ConstructedType, type Feature, type Selector } from "../index";

export interface UpdatesOptions {
    update: Selector<{ value: Node; update: Node }>[];
    numberType: ConstructedType;
}

export const updates =
    (options: UpdatesOptions): Feature =>
    (context) => {
        context.select(options.update, ({ value, update }) => {
            context.edge(value, update, "value");
            context.type(value, options.numberType);
            context.group(update, value);
        });
    };
