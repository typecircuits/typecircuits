import type { Language } from ".";
import { type Node } from "../compiler";
import { languageLoader, parse, type Parser } from "../parser";
import { ConcreteType, type Type } from "../solver";
import { makeNameResolver } from "../name-resolution";
import javascriptLanguageUrl from "tree-sitter-javascript/tree-sitter-javascript.wasm?url";

const loadLanguage = languageLoader(javascriptLanguageUrl);

class NumberType extends ConcreteType {
    render(): string {
        return "number";
    }
}

class StringType extends ConcreteType {
    render(): string {
        return "string";
    }
}

class BooleanType extends ConcreteType {
    render(): string {
        return "boolean";
    }
}

class VoidType extends ConcreteType {
    render(): string {
        return "void";
    }
}

class FunctionType extends ConcreteType {
    kind = "function";

    constructor(inputs: Type[], output: Type) {
        super([output, ...inputs]);
    }

    render(children: ((root: boolean) => string)[], root: boolean): string {
        const [output, ...inputs] = children;
        const rendered = `(${inputs.map((input) => input(false)).join(", ")}) => ${output(true)}`;
        return root ? rendered : `(${rendered})`;
    }
}

class ArrayType extends ConcreteType {
    constructor(element: Type) {
        super([element]);
    }

    render(children: ((root: boolean) => string)[]): string {
        const [element] = children;
        return `${element(false)}[]`;
    }
}

export const javascriptLanguage: Language<Parser> = {
    name: "JavaScript",
    editorExtensions: async () => [(await import("@codemirror/lang-javascript")).javascript()],
    parse: async (code) => {
        const language = await loadLanguage();
        return parse(code, language);
    },
    compile: async (parser, compiler) => {
        compiler.ast = parser.ast;

        // Name resolution

        type Definition =
            { type: "value"; node: Node } | { type: "builtin"; constraints: (node: Node) => void };

        type NameKind = "field";

        const nameResolver = makeNameResolver<Definition, NameKind>(parser.root);

        nameResolver.define("log", parser.root, {
            type: "builtin",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([], new VoidType())]],
                    [[node, new FunctionType([compiler.temporaryAt(node)], new VoidType())]],
                ]);
            },
        });

        nameResolver.define("random", parser.root, {
            type: "builtin",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new FunctionType([], new NumberType())]);
            },
        });

        nameResolver.define("String", parser.root, {
            type: "builtin",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [
                    node,
                    new FunctionType([compiler.temporaryAt(node)], new StringType()),
                ]);
            },
        });

        nameResolver.define("Number", parser.root, {
            type: "builtin",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [
                    node,
                    new FunctionType([compiler.temporaryAt(node)], new NumberType()),
                ]);
            },
        });

        nameResolver.define("Boolean", parser.root, {
            type: "builtin",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [
                    node,
                    new FunctionType([compiler.temporaryAt(node)], new BooleanType()),
                ]);
            },
        });

        parser.traverse(parser.root, {
            variable_declarator: (node) => {
                const { name, value } = node.fields;
                compiler.edge(value, name, "value");
                nameResolver.define(name.code, name, { type: "value", node: name });
                compiler.solver.unifyAt(node, [name, value]);
            },
            assignment_expression: (node) => {
                const { left, right } = node.fields;
                compiler.edge(right, left, "value");
                nameResolver.define(left.code, left, { type: "value", node: left });
                compiler.solver.unifyAt(node, [left, right]);
            },
            formal_parameters: (node) => {
                for (const child of node.children) {
                    nameResolver.define(child.code, child, { type: "value", node: child });
                }
            },
            function_declaration: (node) => {
                const { name } = node.fields;
                nameResolver.define(name.code, name, { type: "value", node });
                nameResolver.scope(node);
            },
            arrow_function: (node) => {
                nameResolver.scope(node);
            },
            for_in_statement: (node) => {
                nameResolver.scope(node);
            },
            member_expression: (node) => {
                const { property } = node.fields;
                nameResolver.setKind(property, "field");
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
                    case "builtin": {
                        definition.constraints(node);
                        break;
                    }
                    default: {
                        definition satisfies never;
                    }
                }
            }
        };

        const traverseFunction = (node: Node, parameters: Node[], returnValue?: Node) => {
            for (const parameter of parameters) {
                compiler.edge(parameter, node, "input");
            }

            let hasReturnValue = false;
            const traverseReturnValue = (value: Node) => {
                compiler.edge(value, node, "output");
                compiler.solver.unifyAt(node, [node, new FunctionType(parameters, value)]);
                hasReturnValue = true;
            };

            if (returnValue != null) {
                traverseReturnValue(returnValue);
            }

            parser.traverse(node, {
                return_statement: (returnStatement) => {
                    const [output] = returnStatement.children;
                    traverseReturnValue(output);
                },
            });

            if (!hasReturnValue) {
                compiler.solver.unifyAt(node, [node, new FunctionType(parameters, new VoidType())]);
            }
        };

        parser.traverse(parser.root, {
            // Identifiers

            identifier: traverseIdentifier,
            property_identifier: traverseIdentifier,
            member_expression: (node) => {
                const { object, property } = node.fields;

                compiler.edge(object, node, "object");
                compiler.replaceAt(node, property, undefined);
                compiler.solver.unifyAt(node, [property, node]);
            },

            // Literals

            string: (node) => {
                compiler.solver.unifyAt(node, [node, new StringType()]);
            },
            number: (node) => {
                compiler.solver.unifyAt(node, [node, new NumberType()]);
            },
            true: (node) => {
                compiler.solver.unifyAt(node, [node, new BooleanType()]);
            },
            false: (node) => {
                compiler.solver.unifyAt(node, [node, new BooleanType()]);
            },

            // Operators

            binary_expression: (node) => {
                const { left, right } = node.fields;
                const { operator } = node.strings;

                compiler.edge(left, node, "left");
                compiler.edge(right, node, "right");

                switch (operator) {
                    case "+": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.overloadAt(node, [
                            [
                                [left, new NumberType()],
                                [node, new NumberType()],
                            ],
                            [
                                [left, new StringType()],
                                [node, new StringType()],
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
                                [left, new NumberType()],
                                [node, new NumberType()],
                            ],
                        ]);

                        break;
                    }
                    case "<":
                    case "<=":
                    case ">":
                    case ">=":
                    case "==":
                    case "===":
                    case "!=":
                    case "!==": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.unifyAt(node, [node, new BooleanType()]);

                        break;
                    }
                    case "&&":
                    case "||": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.unifyAt(node, [left, new BooleanType()]);
                        compiler.solver.unifyAt(node, [node, new BooleanType()]);

                        break;
                    }
                }
            },

            // Functions

            function_declaration: (node) => {
                const parameters = node.fields.parameters.children;
                traverseFunction(node, parameters);
            },
            function_expression: (node) => {
                const parameters = node.fields.parameters.children;
                traverseFunction(node, parameters);
            },
            arrow_function: (node) => {
                const parameters =
                    "parameter" in node.fields
                        ? [node.fields.parameter]
                        : node.fields.parameters.children;

                const { body } = node.fields;
                const returnValue = body.type !== "statement_block" ? body : undefined;

                traverseFunction(node, parameters, returnValue);
            },

            // Function calls

            call_expression: (node) => {
                const { function: functionNode, arguments: inputs } = node.fields;

                compiler.edge(functionNode, node, "function");

                for (const input of inputs.children) {
                    compiler.edge(input, node, "input");
                }

                compiler.solver.unifyAt(functionNode, [
                    functionNode,
                    new FunctionType(inputs.children, node),
                ]);
            },

            // Arrays

            array: (node) => {
                compiler.solver.unifyAt(node, [node, new ArrayType(compiler.temporaryAt(node))]);

                for (const element of node.children) {
                    compiler.edge(element, node, "element");
                    compiler.solver.unifyAt(node, [node, new ArrayType(element)]);
                }
            },
            subscript_expression: (node) => {
                const { object, index } = node.fields;

                compiler.edge(object, node, "array");
                compiler.solver.unifyAt(node, [object, new ArrayType(node)]);

                compiler.edge(index, node, "index");
                compiler.solver.unifyAt(node, [index, new NumberType()]);
            },

            // If statements

            if_statement: (node) => {
                const { condition } = node.fields;
                compiler.solver.unifyAt(node, [condition, new BooleanType()]);
            },
            ternary_expression: (node) => {
                const { condition, consequence, alternative } = node.fields;

                compiler.edge(condition, consequence, "then");
                compiler.edge(consequence, node, "output");

                compiler.edge(condition, alternative, "else");
                compiler.edge(alternative, node, "output");

                compiler.solver.unifyAt(node, [condition, new BooleanType()]);
                compiler.solver.unifyAt(node, [consequence, alternative]);
                compiler.solver.unifyAt(node, [node, consequence]);
            },

            // For loops

            for_in_statement: (node) => {
                const { left, right } = node.fields;

                compiler.edge(right, left, "element");
                compiler.edge(right, node, "array");

                compiler.solver.unifyAt(node, [right, new ArrayType(left)]);
            },

            // Updates

            update_expression: (node) => {
                const { argument } = node.fields;

                compiler.edge(argument, node, "value");

                compiler.solver.unifyAt(node, [argument, new NumberType()]);
                compiler.solver.unifyAt(node, [node, argument]);
            },
        });
    },
};
