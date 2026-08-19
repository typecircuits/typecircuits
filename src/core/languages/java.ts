import type { Language } from ".";
import { type Node } from "../compiler";
import { languageLoader, parse, type Parser } from "../parser";
import { ConcreteType, type Type } from "../solver";
import { makeNameResolver } from "../name-resolution";
import javaLanguageUrl from "tree-sitter-java/tree-sitter-java.wasm?url";

const loadLanguage = languageLoader(javaLanguageUrl);

class IntType extends ConcreteType {
    render(): string {
        return "int";
    }
}

class DoubleType extends ConcreteType {
    render(): string {
        return "double";
    }
}

class StringType extends ConcreteType {
    render(): string {
        return "String";
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
        const rendered = `(${inputs.map((input) => input(false)).join(", ")}) -> ${output(true)}`;
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

export const javaLanguage: Language<Parser> = {
    name: "Java",
    editorExtensions: async () => [(await import("@codemirror/lang-java")).java()],
    parse: async (code) => {
        const language = await loadLanguage();
        return parse(code, language);
    },
    compile: async (parser, compiler) => {
        compiler.ast = parser.ast;

        // Name resolution

        type Definition =
            | { type: "value"; node: Node }
            | { type: "builtinValue"; constraints: (node: Node) => void }
            | { type: "builtinType"; constraints: (node: Node) => void };

        type NameKind = "type" | "field";

        const nameResolver = makeNameResolver<Definition, NameKind>(parser.root);

        nameResolver.define("println", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([], new VoidType())]],
                    [[node, new FunctionType([compiler.temporaryAt(node)], new VoidType())]],
                ]);
            },
        });

        nameResolver.define("length", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [[[node, new FunctionType([], new IntType())]]]);
            },
        });

        nameResolver.define("random", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([], new DoubleType())]],
                ]);
            },
        });

        nameResolver.define("String", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new StringType()]);
            },
        });

        nameResolver.define("Integer", parser.root, {
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

        nameResolver.define("Boolean", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new BooleanType()]);
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
                compiler.solver.unifyAt(node, [left, right]);
            },
            parameters: (node) => {
                for (const child of node.children) {
                    const { name } = child.fields;
                    nameResolver.define(name.code, name, { type: "value", node: name });
                }
            },
            method_declaration: (node) => {
                const { name } = node.fields;
                nameResolver.define(name.code, name, { type: "value", node });
                nameResolver.scope(node);
            },
            for_statement: (node) => {
                nameResolver.scope(node);
            },
            enhanced_for_statement: (node) => {
                nameResolver.scope(node);
            },
            type_identifier: (node) => {
                nameResolver.setKind(node, "type");
            },
            generic_type: (node) => {
                const [name] = node.children;
                nameResolver.setKind(name, "type");
            },
            field_access: (node) => {
                const { field } = node.fields;
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
                    case "builtinType": {
                        if (kind === "type") {
                            definition.constraints(node);
                        }

                        break;
                    }
                    default: {
                        definition satisfies never;
                    }
                }
            }
        };

        const traverseFunction = (node: Node, parameters: Node[], returnType: Node) => {
            for (const parameter of parameters) {
                compiler.edge(parameter, node, "input");
            }

            const traverseReturnValue = (value: Node) => {
                compiler.edge(value, node, "output");
                compiler.solver.unifyAt(node, [node, new FunctionType(parameters, value)]);
            };

            traverseReturnValue(returnType);

            parser.traverse(node, {
                return_statement: (returnStatement) => {
                    const [output] = returnStatement.children;
                    traverseReturnValue(output);
                },
            });
        };

        parser.traverse(parser.root, {
            // Identifiers

            identifier: traverseIdentifier,
            type_identifier: (node) => {
                traverseIdentifier(node);
                compiler.show(node, "types");
            },
            field_access: (node) => {
                const { object, field } = node.fields;

                compiler.edge(object, node, "object");
                compiler.replaceAt(node, field, undefined);
                compiler.solver.unifyAt(node, [field, node]);
            },

            // Literals

            string_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new StringType()]);
            },
            decimal_integer_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new IntType()]);
            },
            decimal_floating_point_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new DoubleType()]);
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
                                [left, new IntType()],
                                [node, new IntType()],
                            ],
                            [
                                [left, new DoubleType()],
                                [node, new DoubleType()],
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
                    case "||": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.unifyAt(node, [left, new BooleanType()]);
                        compiler.solver.unifyAt(node, [node, new BooleanType()]);

                        break;
                    }
                }
            },

            // Functions

            method_declaration: (node) => {
                const { parameters, type } = node.fields;
                traverseFunction(node, parameters.children, type);
            },

            // Function calls

            method_invocation: (node) => {
                const { object, name, arguments: inputs } = node.fields;

                compiler.edge(object, node, "object");
                compiler.edge(name, node, "function");

                for (const input of inputs.children) {
                    compiler.edge(input, node, "input");
                }

                compiler.solver.unifyAt(node, [name, new FunctionType(inputs.children, node)]);
            },

            // Arrays

            array_initializer: (node) => {
                compiler.solver.unifyAt(node, [node, new ArrayType(compiler.temporaryAt(node))]);

                for (const element of node.children) {
                    compiler.edge(element, node, "element");
                    compiler.solver.unifyAt(node, [node, new ArrayType(element)]);
                }
            },
            array_access: (node) => {
                const { array, index } = node.fields;

                compiler.edge(array, node, "array");
                compiler.solver.unifyAt(node, [array, new ArrayType(node)]);

                compiler.edge(index, node, "index");
                compiler.solver.unifyAt(node, [index, new IntType()]);
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

            // Type annotations

            formal_parameter: (node) => {
                const { name, type } = node.fields;
                compiler.edge(type, name, "type");
                compiler.solver.unifyAt(node, [name, type]);
                compiler.replaceAt(node, node, name);
            },
            local_variable_declaration: (node) => {
                const { declarator, type } = node.fields;
                const { name } = declarator.fields;

                compiler.edge(type, name, "type");
                compiler.solver.unifyAt(node, [name, type]);
            },
            array_type: (node) => {
                const { element } = node.fields;
                compiler.solver.unifyAt(node, [node, new ArrayType(element)]);
                compiler.show(node, "types");
            },
            integral_type: (node) => {
                compiler.solver.unifyAt(node, [node, new IntType()]);
                compiler.show(node, "types");
            },
            floating_point_type: (node) => {
                compiler.solver.unifyAt(node, [node, new DoubleType()]);
                compiler.show(node, "types");
            },
            boolean_type: (node) => {
                compiler.solver.unifyAt(node, [node, new BooleanType()]);
                compiler.show(node, "types");
            },
            void_type: (node) => {
                compiler.solver.unifyAt(node, [node, new VoidType()]);
                compiler.show(node, "types");
            },

            // For loops

            enhanced_for_statement: (node) => {
                const { type, name, value } = node.fields;

                compiler.edge(type, name, "type");
                compiler.edge(value, name, "element");
                compiler.edge(value, node, "array");

                compiler.solver.unifyAt(node, [name, type]);
                compiler.solver.unifyAt(node, [value, new ArrayType(name)]);
            },

            // Updates

            update_expression: (node) => {
                const [value] = node.children;

                compiler.edge(value, node, "value");

                compiler.solver.unifyAt(node, [value, new IntType()]);
                compiler.solver.unifyAt(node, [node, value]);
            },
        });
    },
};
