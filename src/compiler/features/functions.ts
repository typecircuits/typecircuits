import { Node, type ConstructedType, type Feature, type Selector, type Type } from "../index";

export interface FunctionCallsOptions {
    call: Selector<{ object?: Node; function: Node; inputs: Node[]; call: Node }>[];
    functionType: (inputs: Type[], output: Type) => ConstructedType;
}

export const functionCalls =
    (options: FunctionCallsOptions): Feature =>
    (context) => {
        context.select(options.call, ({ object, function: functionNode, inputs, call }) => {
            if (object != null) {
                context.transparent(object);
            }

            context.edge(functionNode, call, "function");

            for (const input of inputs) {
                context.edge(input, call, "input");
            }

            context.type(functionNode, options.functionType(inputs, call));
        });
    };

export interface FieldOptions {
    field: Selector<{ object?: Node; field: Node; access: Node }>[];
}

export const fields =
    (options: FieldOptions): Feature =>
    (context) => {
        context.select(options.field, ({ object, field, access }) => {
            if (object != null) {
                context.transparent(object);
                context.edge(object, access, "object");
            }

            context.edge(field, access, "property");

            context.transparent(field);
            context.group(field, access);
        });
    };

export interface FunctionsOptions {
    function: Selector<{ function: Node; definition?: Node; inputs: Node[]; output?: Node }>[];
    returnValue: Selector<Node>[];
    functionType: (inputs: Type[], output: Type) => ConstructedType;
    voidType: Type;
}

export const functions =
    (options: FunctionsOptions): Feature =>
    (context) => {
        context.select(
            options.function,
            ({ function: functionNode, definition, inputs, output }) => {
                if (definition != null) {
                    context.replace(definition, functionNode);
                }

                for (const input of inputs) {
                    context.edge(input, functionNode, "input");
                }

                if (output != null) {
                    context.edge(output, functionNode, "return type");

                    if (!context.show.types) {
                        context.transparent(output);
                    }
                }

                context.type(functionNode, options.functionType(inputs, output ?? null));

                let hasReturnValue = false;
                context.select(options.returnValue, (returnValue) => {
                    if (context.hasChild(functionNode, returnValue)) {
                        context.edge(returnValue, functionNode, "output");

                        if (output != null) {
                            context.type(output, returnValue);
                        } else {
                            context.type(functionNode, options.functionType(inputs, returnValue));
                        }

                        hasReturnValue = true;
                    }
                });

                if (!hasReturnValue && output == null) {
                    context.type(functionNode, options.functionType(inputs, options.voidType));
                }
            },
        );
    };
