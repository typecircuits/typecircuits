import type { Language } from ".";
import { type Node } from "../compiler";
import { languageLoader, parse, type Parser } from "../parser";
import { ConcreteType, type Type } from "../solver";
import { makeNameResolver } from "../name-resolution";
import pythonLanguageUrl from "tree-sitter-python/tree-sitter-python.wasm?url";

const loadLanguage = languageLoader(pythonLanguageUrl);

class IntType extends ConcreteType {
    render(): string {
        return "int";
    }
}

class FloatType extends ConcreteType {
    render(): string {
        return "float";
    }
}

class StrType extends ConcreteType {
    render(): string {
        return "str";
    }
}

class BoolType extends ConcreteType {
    render(): string {
        return "bool";
    }
}

class NoneType extends ConcreteType {
    render(): string {
        return "None";
    }
}

class FunctionType extends ConcreteType {
    kind = "function";

    constructor(inputs: Type[], output: Type) {
        super([output, ...inputs]);
    }

    render(children: ((root: boolean) => string)[], root: boolean): string {
        const [output, ...inputs] = children;
        const rendered = `(${inputs.map((input) => input(false)).join(",")}) -> ${output(true)}`;
        return root ? rendered : `(${rendered})`;
    }
}

class ListType extends ConcreteType {
    constructor(element: Type) {
        super([element]);
    }

    render(children: ((root: boolean) => string)[]): string {
        const [element] = children;
        return `list[${element(true)}]`;
    }
}

export const pythonLanguage: Language<Parser> = {
    name: "Python",
    editorExtensions: async () => [(await import("@codemirror/lang-python")).python()],
    parse: async (code) => {
        const language = await loadLanguage();
        return parse(code, language);
    },
    compile: async (parser, compiler) => {
        compiler.ast = parser.ast;

        // Name resolution

        type Definition =
            | { type: "value"; node: Node }
            | { type: "type"; node: Node; concreteType: ConcreteType }
            | { type: "builtinValue"; constraints: (node: Node) => void }
            | { type: "builtinType"; constraints: (node: Node) => void };

        type NameKind = "field" | "type";

        const nameResolver = makeNameResolver<Definition, NameKind>(parser.root);

        nameResolver.define("print", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([], new NoneType())]],
                    [[node, new FunctionType([compiler.temporaryAt(node)], new NoneType())]],
                ]);
            },
        });

        nameResolver.define("len", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([compiler.temporaryAt(node)], new IntType())]],
                ]);
            },
        });

        nameResolver.define("randint", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [[[node, new FunctionType([], new IntType())]]]);
            },
        });

        nameResolver.define("range", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([new IntType()], new ListType(new IntType()))]],
                ]);
            },
        });

        nameResolver.define("str", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new StrType()]);
            },
        });

        nameResolver.define("str", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([compiler.temporaryAt(node)], new StrType())]],
                ]);
            },
        });

        nameResolver.define("int", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new IntType()]);
            },
        });

        nameResolver.define("int", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([compiler.temporaryAt(node)], new IntType())]],
                ]);
            },
        });

        nameResolver.define("float", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new FloatType()]);
            },
        });

        nameResolver.define("float", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([compiler.temporaryAt(node)], new FloatType())]],
                ]);
            },
        });

        nameResolver.define("bool", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new BoolType()]);
            },
        });

        nameResolver.define("bool", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([compiler.temporaryAt(node)], new BoolType())]],
                ]);
            },
        });

        parser.traverse(parser.root, {
            assignment: (node) => {
                const { left, right } = node.fields;
                compiler.edge(right, left, "value");
                nameResolver.define(left.code, left, { type: "value", node: left });
                compiler.solver.unifyAt(node, [left, right]);
            },
            parameters: (node) => {
                for (const child of node.children) {
                    nameResolver.define(child.code, child, { type: "value", node: child });
                }
            },
            function_definition: (node) => {
                const { name } = node.fields;
                nameResolver.define(name.code, name, { type: "value", node });
                nameResolver.scope(node);
            },
            for_statement: (node) => {
                nameResolver.scope(node);
            },
            attribute: (node) => {
                const { attribute } = node.fields;
                nameResolver.setKind(attribute, "field");
            },
            type: (node) => {
                const [name] = node.children;
                nameResolver.setKind(name, "type");
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
                        if (kind == null) {
                            compiler.solver.unifyAt(node, [node, definition.node]);
                            compiler.replaceAt(node, node, definition.node);
                        }

                        break;
                    }
                    case "builtinValue": {
                        if (kind == null) {
                            definition.constraints(node);
                        }

                        break;
                    }
                    default: {
                        break;
                    }
                }
            }
        };

        const traverseType = (node: Node) => {
            const definitions = nameResolver.resolve(node.code, node, {
                implicitlyDefine: () => ({
                    type: "type",
                    node,
                    // TODO: Explicit user-defined types
                    concreteType: new (class extends ConcreteType {
                        render(): string {
                            return node.code;
                        }
                    })(),
                }),
            });

            for (const definition of definitions) {
                switch (definition.type) {
                    case "type": {
                        compiler.solver.unifyAt(node, [node, definition.concreteType]);
                        break;
                    }
                    case "builtinType": {
                        definition.constraints(node);
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
                return_statement: (returnStatement) => {
                    const [output] = returnStatement.children;
                    traverseReturnValue(output);
                },
            });

            if (!hasReturnValue) {
                compiler.solver.unifyAt(node, [node, new FunctionType(parameters, new NoneType())]);
            }
        };

        parser.traverse(parser.root, {
            // Identifiers

            identifier: traverseIdentifier,
            member_expression: (node) => {
                const { object, attribute } = node.fields;

                compiler.edge(object, node, "object");
                compiler.replaceAt(node, attribute, undefined);
                compiler.solver.unifyAt(node, [attribute, node]);
            },

            // Literals

            string: (node) => {
                compiler.solver.unifyAt(node, [node, new StrType()]);
            },
            integer: (node) => {
                compiler.solver.unifyAt(node, [node, new IntType()]);
            },
            float: (node) => {
                compiler.solver.unifyAt(node, [node, new FloatType()]);
            },
            true: (node) => {
                compiler.solver.unifyAt(node, [node, new BoolType()]);
            },
            false: (node) => {
                compiler.solver.unifyAt(node, [node, new BoolType()]);
            },

            // Operators

            binary_operator: (node) => {
                const { left, right } = node.fields;
                const { operator } = node.strings;

                compiler.edge(left, node, "left");
                compiler.edge(right, node, "right");

                switch (operator) {
                    case "+": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.overloadAt(node, [
                            [
                                [left, new IntType()],
                                [node, new IntType()],
                            ],
                            [
                                [left, new FloatType()],
                                [node, new FloatType()],
                            ],
                            [
                                [left, new StrType()],
                                [node, new StrType()],
                            ],
                        ]);

                        break;
                    }
                    case "-":
                    case "*":
                    case "%":
                    case "**": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.overloadAt(node, [
                            [
                                [left, new IntType()],
                                [node, new IntType()],
                            ],
                            [
                                [left, new FloatType()],
                                [node, new FloatType()],
                            ],
                        ]);

                        break;
                    }
                    case "/": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.overloadAt(node, [
                            [
                                [left, new IntType()],
                                [node, new FloatType()],
                            ],
                            [
                                [left, new FloatType()],
                                [node, new FloatType()],
                            ],
                        ]);

                        break;
                    }
                    case "//": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.overloadAt(node, [
                            [
                                [left, new IntType()],
                                [node, new IntType()],
                            ],
                            [
                                [left, new FloatType()],
                                [node, new IntType()],
                            ],
                        ]);

                        break;
                    }
                }
            },
            comparison_operator: (node) => {
                const [left, right] = node.children;
                const { operators: operator } = node.strings;

                compiler.edge(left, node, "left");
                compiler.edge(right, node, "right");

                switch (operator) {
                    case "<":
                    case "<=":
                    case ">":
                    case ">=":
                    case "==":
                    case "!=": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.unifyAt(node, [node, new BoolType()]);

                        break;
                    }
                }
            },
            boolean_operator: (node) => {
                const { left, right } = node.fields;
                const { operator } = node.strings;

                compiler.edge(left, node, "left");
                compiler.edge(right, node, "right");

                switch (operator) {
                    case "and":
                    case "or": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.unifyAt(node, [node, new BoolType()]);

                        break;
                    }
                }
            },

            // Functions

            function_definition: (node) => {
                const { parameters, return_type } = node.fields;
                traverseFunction(node, parameters.children, return_type);
            },

            // Function calls

            call: (node) => {
                const { function: functionNode, arguments: inputs } = node.fields;

                compiler.edge(functionNode, node, "function");

                for (const input of inputs.children) {
                    compiler.edge(input, node, "input");
                }

                compiler.solver.unifyAt(node, [
                    functionNode,
                    new FunctionType(inputs.children, node),
                ]);
            },

            // Lists

            list: (node) => {
                compiler.solver.unifyAt(node, [node, new ListType(compiler.temporaryAt(node))]);

                for (const element of node.children) {
                    compiler.edge(element, node, "element");
                    compiler.solver.unifyAt(node, [node, new ListType(element)]);
                }
            },
            subscript: (node) => {
                const { value, subscript } = node.fields;

                compiler.edge(value, node, "array");
                compiler.solver.unifyAt(node, [value, new ListType(node)]);

                compiler.edge(subscript, node, "index");
                compiler.solver.unifyAt(node, [subscript, new IntType()]);
            },

            // If statements

            if_statement: (node) => {
                const { condition } = node.fields;
                compiler.solver.unifyAt(node, [condition, new BoolType()]);
            },
            conditional_expression: (node) => {
                const [thenValue, condition, elseValue] = node.children;

                compiler.edge(condition, thenValue, "then");
                compiler.edge(thenValue, node, "output");

                compiler.edge(condition, elseValue, "else");
                compiler.edge(elseValue, node, "output");

                compiler.solver.unifyAt(node, [condition, new BoolType()]);
                compiler.solver.unifyAt(node, [thenValue, elseValue]);
                compiler.solver.unifyAt(node, [node, thenValue]);
            },

            // Type annotations

            type: (node) => {
                const [name] = node.children;
                traverseType(name);
                compiler.replaceAt(node, name, node);
                compiler.solver.unifyAt(node, [name, node]);
                compiler.show(node, "types");
            },

            typed_parameter: (node) => {
                const [parameter, type] = node.children;
                compiler.edge(type, parameter, "type");
                compiler.solver.unifyAt(node, [parameter, type]);
                compiler.solver.unifyAt(node, [parameter, node]);
                compiler.replaceAt(node, node, parameter);
            },

            assignment: (node) => {
                const { left, type } = node.fields;

                if (type != null) {
                    compiler.edge(type, left, "type");
                    compiler.solver.unifyAt(node, [left, type]);
                }
            },

            // For loops

            for_statement: (node) => {
                const { left, right } = node.fields;

                compiler.edge(right, left, "element");
                compiler.edge(right, node, "array");

                compiler.solver.unifyAt(node, [right, new ListType(left)]);
            },
        });
    },
};
