import { Node, type ConstructedType, type Feature, type Selector } from "../index";

export interface IfExpressionOptions {
    if: Selector<{ condition: Node; then?: Node; else?: Node; output: Node }>[];
    booleanType: ConstructedType;
}

export const ifExpression =
    (options: IfExpressionOptions): Feature =>
    (context) => {
        context.select(options.if, ({ condition, then: thenBranch, else: elseBranch, output }) => {
            context.type(condition, options.booleanType);

            if (thenBranch != null) {
                context.edge(condition, thenBranch, "then");
                context.edge(thenBranch, output, "output");
                context.group(thenBranch, output);
            }

            if (elseBranch != null) {
                context.edge(condition, elseBranch, "else");
                context.edge(elseBranch, output, "output");
                context.group(elseBranch, output);
            }
        });
    };
