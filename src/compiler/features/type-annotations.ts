import { Node, type Feature, type Selector } from "../index";
import { constructedType, type ConstructedType, type Type } from "../solver/type";

export interface TypeAnnotationsOptions {
    typeAnnotation: Selector<{
        value?: Node;
        annotatedType?: Node;
        type?: (node: Node) => NonNullable<Type>;
        annotation?: Node;
        annotate?: Selector<Node>[];
    }>[];
    type: Selector<Node>[];
}

export const typeAnnotations =
    (options: TypeAnnotationsOptions): Feature =>
    (context) => {
        context.select(
            options.typeAnnotation,
            ({ value, annotatedType, type, annotation, annotate }) => {
                if (annotatedType != null) {
                    context.atomic(annotatedType);

                    const resolvedType = type != null ? type(annotatedType) : annotatedType;

                    if (value != null) {
                        context.edge(annotatedType, value, "type");
                        context.type(value, resolvedType);

                        if (annotate != null) {
                            context.select(annotate, (node) => {
                                if (context.hasChild(value, node)) {
                                    context.type(node, annotatedType);
                                }
                            });
                        }
                    } else {
                        context.type(annotatedType, resolvedType);
                    }

                    if (!context.options.showTypes) {
                        context.transparent(annotatedType);
                    }
                }

                if (value != null && annotation != null) {
                    context.group(value, annotation);
                    context.transparent(annotation);
                }
            },
        );

        context.select(options.type, (node) => {
            const type = constructedType({
                tag: node.text,
                children: [],
                display: () => node.text,
            });

            context.type(node, type);

            if (!context.options.showTypes) {
                context.transparent(node);
            }
        });
    };
