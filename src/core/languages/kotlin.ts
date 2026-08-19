import type { Language } from ".";
import { type Node } from "../compiler";
import { languageLoader, parse, type Parser } from "../parser";
import { ConcreteType, type Type } from "../solver";
import { makeNameResolver } from "../name-resolution";
import kotlinLanguageUrl from "@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm?url";
import { StreamLanguage } from "@codemirror/language";

const loadLanguage = languageLoader(kotlinLanguageUrl);

class IntType extends ConcreteType {
    render(): string {
        return "Int";
    }
}

class DoubleType extends ConcreteType {
    render(): string {
        return "Double";
    }
}

class StringType extends ConcreteType {
    render(): string {
        return "String";
    }
}

class BooleanType extends ConcreteType {
    render(): string {
        return "Boolean";
    }
}

class UnitType extends ConcreteType {
    render(): string {
        return "Unit";
    }
}

class FunctionType extends ConcreteType {
    kind = "function";

    constructor(inputs: Type[], output: Type) {
        super([output, ...inputs]);
    }

    render(children: ((root: boolean) => string)[], root: boolean): string {
        const [output, ...inputs] = children;
        const rendered = `(${inputs.map((input) => input(false)).join(", ")}) -> ${output(true)}`;
        return root ? rendered : `(${rendered})`;
    }
}

class ListType extends ConcreteType {
    kind = "list";

    constructor(element: Type) {
        super([element]);
    }

    render(children: ((root: boolean) => string)[], _root: boolean): string {
        const [element] = children;
        return `List<${element(true)}>`;
    }
}

const userDefinedType = (name: string, parameters: Type[]) =>
    new (class extends ConcreteType {
        constructor() {
            super(parameters);
        }

        render(children: ((root: boolean) => string)[], _root: boolean): string {
            return children.length === 0
                ? name
                : `${name}<${children.map((child) => child(true)).join(", ")}>`;
        }
    })();

export const kotlinLanguage: Language<Parser> = {
    name: "Kotlin",
    editorExtensions: async () => [
        StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).kotlin),
    ],
    parse: async (code) => {
        const language = await loadLanguage();
        return parse(code, language);
    },
    compile: async (parser, compiler) => {
        compiler.ast = parser.ast;

        // Name resolution

        type Definition =
            | { type: "value"; node: Node }
            | {
                  type: "type";
                  node: Node;
                  instanceType: (parameters: Node[]) => Type;
                  primaryConstructor?: Node;
              }
            | { type: "builtinValue"; constraints: (node: Node) => void }
            | {
                  type: "builtinFunction";
                  constraints: (node: Node, inputs: Node[]) => void;
              }
            | {
                  type: "builtinMethod";
                  constraints: (node: Node, object: Node, inputs: Node[]) => void;
              }
            | { type: "builtinType"; constraints: (node: Node, parameters: Node[]) => void };

        type NameKind = "type" | "field" | "constructor";

        const nameResolver = makeNameResolver<Definition, NameKind>(parser.root);

        nameResolver.define("true", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new BooleanType()]);
            },
        });

        nameResolver.define("false", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new BooleanType()]);
            },
        });

        nameResolver.define("println", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([], new UnitType())]],
                    [[node, new FunctionType([compiler.temporaryAt(node)], new UnitType())]],
                ]);
            },
        });

        nameResolver.define("listOf", parser.root, {
            type: "builtinFunction",
            constraints: (node, inputs) => {
                const element = inputs.length > 0 ? inputs[0] : compiler.temporaryAt(node);

                // All elements must have the same type
                for (const other of inputs.slice(1)) {
                    compiler.solver.unifyAt(node, [other, element]);
                }

                compiler.solver.unifyAt(node, [node, new ListType(element)]);
            },
        });

        nameResolver.define("listOf", parser.root, {
            type: "builtinMethod",
            constraints: (node, object, inputs) => {
                const element = inputs.length > 0 ? inputs[0] : compiler.temporaryAt(node);

                // All elements must have the same type
                for (const other of inputs.slice(1)) {
                    compiler.solver.unifyAt(node, [other, element]);
                }

                compiler.solver.unifyAt(node, [object, new ListType(element)]);
            },
        });

        nameResolver.define("shouldBe", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                const input = compiler.temporaryAt(node);

                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([input, input], new UnitType())]],
                ]);
            },
        });

        nameResolver.define("size", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new IntType()]);
            },
        });

        nameResolver.define("map", parser.root, {
            type: "builtinMethod",
            constraints: (node, object) => {
                const element = compiler.temporaryAt(node);
                const result = compiler.temporaryAt(node);

                compiler.solver.unifyAt(node, [object, new ListType(element)]);

                compiler.solver.overloadAt(node, [
                    [
                        [
                            node,
                            new FunctionType(
                                [new FunctionType([element], result)],
                                new ListType(result),
                            ),
                        ],
                    ],
                ]);
            },
        });

        nameResolver.define("filter", parser.root, {
            type: "builtinMethod",
            constraints: (node, object) => {
                const element = compiler.temporaryAt(node);

                compiler.solver.unifyAt(node, [object, new ListType(element)]);

                compiler.solver.overloadAt(node, [
                    [
                        [
                            node,
                            new FunctionType(
                                [new FunctionType([element], new BooleanType())],
                                object,
                            ),
                        ],
                    ],
                ]);
            },
        });

        nameResolver.define("fold", parser.root, {
            type: "builtinMethod",
            constraints: (node, object) => {
                const element = compiler.temporaryAt(node);
                const result = compiler.temporaryAt(node);

                compiler.solver.unifyAt(node, [object, new ListType(element)]);

                compiler.solver.overloadAt(node, [
                    [
                        [
                            node,
                            new FunctionType(
                                [result, new FunctionType([result, element], result)],
                                result,
                            ),
                        ],
                    ],
                ]);
            },
        });

        nameResolver.define("any", parser.root, {
            type: "builtinMethod",
            constraints: (node, object) => {
                const element = compiler.temporaryAt(node);

                compiler.solver.unifyAt(node, [object, new ListType(element)]);

                compiler.solver.overloadAt(node, [
                    [
                        [
                            node,
                            new FunctionType(
                                [new FunctionType([element], new BooleanType())],
                                new BooleanType(),
                            ),
                        ],
                    ],
                ]);
            },
        });

        nameResolver.define("all", parser.root, {
            type: "builtinMethod",
            constraints: (node, object) => {
                const element = compiler.temporaryAt(node);

                compiler.solver.unifyAt(node, [object, new ListType(element)]);

                compiler.solver.overloadAt(node, [
                    [
                        [
                            node,
                            new FunctionType(
                                [new FunctionType([element], new BooleanType())],
                                new BooleanType(),
                            ),
                        ],
                    ],
                ]);
            },
        });

        nameResolver.define("Int", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new IntType()]);
            },
        });

        nameResolver.define("Double", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new DoubleType()]);
            },
        });

        nameResolver.define("String", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new StringType()]);
            },
        });

        nameResolver.define("Boolean", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new BooleanType()]);
            },
        });

        nameResolver.define("Unit", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new UnitType()]);
            },
        });

        nameResolver.define("List", parser.root, {
            type: "builtinType",
            constraints: (node, parameters) => {
                const element = parameters[0] ?? compiler.temporaryAt(node);
                compiler.solver.unifyAt(node, [node, new ListType(element)]);
            },
        });

        parser.traverse(parser.root, {
            property_declaration: (node) => {
                const [left, right] = node.children;
                compiler.edge(right, left, "value");
                nameResolver.define(left.code, left, { type: "value", node: left });
                compiler.solver.unifyAt(node, [left, right]);
            },
            assignment: (node) => {
                const { left, right } = node.fields;
                compiler.edge(right, left, "value");
                compiler.solver.unifyAt(node, [left, right]);
            },
            function_value_parameters: (node) => {
                for (const child of node.children) {
                    const [name] = child.children;
                    nameResolver.define(name.code, name, { type: "value", node: name });
                }
            },
            function_declaration: (node) => {
                const { name } = node.fields;
                nameResolver.define(name.code, name, { type: "value", node });
                nameResolver.scope(node);
            },
            class_declaration: (node) => {
                const { name } = node.fields;

                compiler.replaceAt(node, name, node);

                const interfaceNode = node.children.find(
                    (child) => child.type === "delegation_specifiers",
                )?.children[0]?.children[0];

                if (interfaceNode != null) {
                    nameResolver.setKind(interfaceNode, "type");
                }

                const instanceType = (parameters: Node[]) =>
                    interfaceNode ?? userDefinedType(name.code, parameters);

                const primaryConstructor = node.children.find(
                    (child) => child.type === "primary_constructor",
                );

                if (primaryConstructor != null) {
                    compiler.replaceAt(node, primaryConstructor, undefined);

                    const [parameterList] = primaryConstructor.children;
                    const parameters = parameterList.children.map(
                        (parameter) => parameter.children[0],
                    );

                    for (const parameter of parameters) {
                        compiler.edge(parameter, node, "input");
                    }

                    compiler.solver.unifyAt(node, [
                        primaryConstructor,
                        new FunctionType(
                            parameters,
                            instanceType([]), // TODO: Use defined parameters
                        ),
                    ]);
                }

                nameResolver.define(name.code, name, {
                    type: "type",
                    node,
                    instanceType,
                    primaryConstructor,
                });
            },
            for_statement: (node) => {
                nameResolver.scope(node);
            },
            block: (node) => {
                nameResolver.scope(node);
            },
            user_type: (node) => {
                const [name] = node.children;
                nameResolver.setKind(name, "type");
            },
            navigation_expression: (node) => {
                const [_object, field] = node.children;
                nameResolver.setKind(field, "field");
            },
        });

        const traverseIdentifier = (node: Node) => {
            const kind = nameResolver.getKind(node);

            const definitions = nameResolver.resolve(node.code, node, {
                implicitlyDefine: () => (kind == null ? { type: "value", node } : undefined),
            });

            for (const definition of definitions) {
                switch (definition.type) {
                    case "value": {
                        compiler.solver.unifyAt(node, [node, definition.node]);
                        compiler.replaceAt(node, node, definition.node);

                        break;
                    }
                    case "builtinValue": {
                        if (kind == null) {
                            definition.constraints(node);
                        }

                        break;
                    }
                    case "type": {
                        if (kind == null && definition.primaryConstructor != null) {
                            compiler.solver.unifyAt(node, [node, definition.primaryConstructor]);
                        }

                        break;
                    }
                    default: {
                        break;
                    }
                }
            }
        };

        const traverseFunction = (node: Node, parameters: Node[], returnType?: Node) => {
            for (const parameter of parameters) {
                compiler.edge(parameter, node, "input");
            }

            let hasReturnValue = false;
            const traverseReturnValue = (value: Node) => {
                compiler.edge(value, node, "output");
                compiler.solver.unifyAt(node, [node, new FunctionType(parameters, value)]);
                hasReturnValue = true;
            };

            if (returnType != null) {
                traverseReturnValue(returnType);
            }

            parser.traverse(node, {
                return_expression: (returnStatement) => {
                    const [output] = returnStatement.children;
                    traverseReturnValue(output);
                },
            });

            if (!hasReturnValue) {
                compiler.solver.unifyAt(node, [node, new FunctionType(parameters, new UnitType())]);
            }
        };

        const traverseCall = (node: Node, functionNode: Node, inputs: Node[]) => {
            let resolved = false;
            switch (functionNode.type) {
                case "identifier": {
                    const definitions = nameResolver.resolve(functionNode.code, node);

                    for (const definition of definitions) {
                        if (definition.type === "builtinFunction") {
                            definition.constraints(node, inputs);
                            resolved = true;
                        }
                    }

                    break;
                }
                case "navigation_expression": {
                    const [object, field] = functionNode.children;

                    const definitions = nameResolver.resolve(field.code, node);

                    for (const definition of definitions) {
                        if (definition.type === "builtinMethod") {
                            definition.constraints(node, object, inputs);
                            resolved = true;
                        }
                    }

                    break;
                }
                default: {
                    break;
                }
            }

            if (!resolved) {
                compiler.solver.unifyAt(node, [functionNode, new FunctionType(inputs, node)]);
            }
        };

        parser.traverse(parser.root, {
            // Identifiers

            identifier: traverseIdentifier,
            navigation_expression: (node) => {
                const [object, field] = node.children;

                compiler.edge(object, node, "object");
                compiler.replaceAt(node, field, undefined);
                compiler.solver.unifyAt(node, [field, node]);
            },

            // Literals

            string_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new StringType()]);
            },
            number_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new IntType()]);
            },
            float_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new DoubleType()]);
            },
            unary_expression: (node) => {
                const { argument } = node.fields;

                if (argument.type === "number_literal" || argument.type === "float_literal") {
                    // Negative number literals
                    compiler.solver.unifyAt(node, [node, argument]);
                    compiler.replaceAt(node, argument, undefined);
                }
            },
            range_expression: (node) => {
                compiler.solver.unifyAt(node, [node, new ListType(new IntType())]);
            },

            // Operators

            binary_expression: (node) => {
                const { left, right } = node.fields;
                const { operator } = node.strings;

                compiler.edge(left, node, "left");
                compiler.edge(right, node, "right");

                switch (operator) {
                    case "+": {
                        compiler.solver.overloadAt(node, [
                            [
                                [left, new IntType()],
                                [left, right],
                                [node, new IntType()],
                            ],
                            [
                                [left, new DoubleType()],
                                [left, right],
                                [node, new DoubleType()],
                            ],
                            [
                                [left, new StringType()],
                                [left, right],
                                [node, new StringType()],
                            ],
                            [
                                [left, new ListType(right)],
                                [node, new ListType(right)],
                            ],
                        ]);

                        break;
                    }
                    case "-":
                    case "*":
                    case "/":
                    case "%":
                    case "**": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.overloadAt(node, [
                            [
                                [left, new IntType()],
                                [node, new IntType()],
                            ],
                            [
                                [left, new DoubleType()],
                                [node, new DoubleType()],
                            ],
                        ]);

                        break;
                    }
                    case "<":
                    case "<=":
                    case ">":
                    case ">=":
                    case "==":
                    case "!=": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.unifyAt(node, [node, new BooleanType()]);

                        break;
                    }
                    case "&&":
                    case "and":
                    case "||":
                    case "or": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.unifyAt(node, [left, new BooleanType()]);
                        compiler.solver.unifyAt(node, [node, new BooleanType()]);

                        break;
                    }
                }
            },

            // Functions

            function_declaration: (node) => {
                const parameters = node.children[1];

                const returnType =
                    node.children.length === 4 ||
                    (node.children.length === 3 && node.children[2].type !== "function_body")
                        ? node.children[2]
                        : undefined;

                traverseFunction(node, parameters.children, returnType);
            },

            callable_reference: (node) => {
                const [name] = node.children;
                compiler.replaceAt(node, node, name);
            },

            // Function calls

            call_expression: (node) => {
                const [functionNode, inputList] = node.children;

                const inputs = inputList.children.map((input) => input.children[0]);

                compiler.edge(functionNode, node, "function");

                for (const input of inputs) {
                    compiler.edge(input, node, "input");
                }

                traverseCall(node, functionNode, inputs);
            },

            infix_expression: (node) => {
                const [left, functionNode, right] = node.children;

                compiler.edge(left, node, "left");
                compiler.edge(functionNode, node, "function");
                compiler.edge(right, node, "right");

                traverseCall(node, functionNode, [left, right]);
            },

            // Arrays

            collection_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new ListType(compiler.temporaryAt(node))]);

                for (const element of node.children) {
                    compiler.edge(element, node, "element");
                    compiler.solver.unifyAt(node, [node, new ListType(element)]);
                }
            },

            index_expression: (node) => {
                const [array, index] = node.children;

                compiler.edge(array, node, "array");
                compiler.solver.unifyAt(node, [array, new ListType(node)]);

                compiler.edge(index, node, "index");
                compiler.solver.unifyAt(node, [index, new IntType()]);
            },

            // If statements

            if_expression: (node) => {
                const [condition, consequence = undefined, alternative = undefined] = node.children;

                compiler.solver.unifyAt(node, [condition, new BooleanType()]);

                if (consequence != null && consequence.type !== "block") {
                    compiler.edge(condition, consequence, "then");
                    compiler.edge(consequence, node, "output");
                    compiler.solver.unifyAt(node, [node, consequence]);
                }

                if (alternative != null && alternative.type !== "block") {
                    compiler.edge(condition, alternative, "else");
                    compiler.edge(alternative, node, "output");
                    compiler.solver.unifyAt(node, [node, alternative]);
                }
            },

            // Type annotations

            user_type: (node) => {
                const [name, parameterList = undefined] = node.children;

                const parameters =
                    parameterList?.children.map((parameter) => parameter.children[0]) ?? [];

                for (const parameter of parameters) {
                    compiler.edge(parameter, node, "type");
                }

                const kind = nameResolver.getKind(name);

                const definitions = nameResolver.resolve(name.code, node, {
                    implicitlyDefine: () =>
                        kind == "type"
                            ? {
                                  type: "type",
                                  node,
                                  instanceType: (parameters) =>
                                      userDefinedType(name.code, parameters),
                              }
                            : undefined,
                });

                for (const definition of definitions) {
                    switch (definition.type) {
                        case "builtinType": {
                            definition.constraints(node, parameters);

                            break;
                        }
                        case "type": {
                            compiler.solver.unifyAt(node, [
                                node,
                                definition.instanceType(parameters),
                            ]);

                            break;
                        }
                        default: {
                            break;
                        }
                    }
                }

                compiler.show(node, "types");
            },

            parameter: (node) => {
                const [parameter, type] = node.children;
                compiler.edge(type, parameter, "type");
                compiler.solver.unifyAt(node, [parameter, type]);
                compiler.solver.unifyAt(node, [parameter, node]);
                compiler.replaceAt(node, node, parameter);
            },

            class_parameter: (node) => {
                const [parameter, type] = node.children;
                compiler.edge(type, parameter, "type");
                compiler.solver.unifyAt(node, [parameter, type]);
                compiler.solver.unifyAt(node, [parameter, node]);
                compiler.replaceAt(node, node, parameter);
            },

            variable_declaration: (node) => {
                const [name, type] = node.children;
                compiler.edge(type, name, "type");
                compiler.solver.unifyAt(node, [name, type]);
                compiler.solver.unifyAt(node, [name, node]);
                compiler.replaceAt(node, node, name);
            },

            // For loops

            for_statement: (node) => {
                const [element, array] = node.children;

                compiler.edge(array, element, "element");
                compiler.edge(element, node, "array");

                compiler.solver.unifyAt(node, [array, new ListType(element)]);
            },
        });
    },
};
