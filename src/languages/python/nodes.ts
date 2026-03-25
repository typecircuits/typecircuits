import type * as ts from "web-tree-sitter";
import { Node, type NodeDisplay, type Parse } from "@/compiler/lower/node";
import type { LowerContext } from "@/compiler/lower";
import * as types from "./types";
import { operators } from "./operators";
import { tryBuiltin } from "./builtins";

export class IdentifierNode extends Node {
    name: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.name = syntaxNode.text;
    }

    lower(ctx: LowerContext): Node | void {
        if (this.name === "_") {
            this.display = "hidden";
            return;
        }

        if (this.name === "self") {
            if (ctx.thisType != null) {
                this.display = "hidden";
                ctx.typeConstraint(this, ctx.thisType);
            }

            return;
        }

        if (tryBuiltin(this.name, this, ctx)) {
            return;
        }

        return ctx.resolve(this.name, this);
    }
}

export class TypeNode extends Node {
    name: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.name = syntaxNode.text;
    }

    lower(ctx: LowerContext): Node | void {
        if (!ctx.options.showTypes) {
            this.display = "hidden";
        }

        if (tryBuiltin(this.name, this, ctx)) {
            return;
        }

        const classDefinition = ctx.resolve(`class ${this.name}`, this);
        if (classDefinition != null) {
            ctx.typeConstraint(this, types.named(classDefinition, [], this.name));
        }
    }
}

export class AttributeNode extends Node {
    object: Node;
    attribute: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.object] = parse(syntaxNode.childForFieldName("object")!);
        [this.attribute] = parse(syntaxNode.childForFieldName("attribute")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.object.display = "hidden"; // place before lowering so only non-replaced nodes are hidden
        this.object = ctx.lower(this.object);

        this.attribute = ctx.lower(this.attribute);

        ctx.edge({
            from: this.object,
            to: this,
            label: "object",
            description: "The object containing the attribute.",
            example: ["", "random", ".randint"],
        });

        tryBuiltin(`${this.object.span.source}.${this.attribute.span.source}`, this, ctx);
    }
}

export class AssignmentNode extends Node {
    variable: Node;
    type?: Node;
    value: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.variable] = parse(syntaxNode.childForFieldName("left")!);
        [this.type] = parse(syntaxNode.childForFieldName("type"));
        [this.value] = parse(syntaxNode.childForFieldName("right")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.variable = ctx.lower(this.variable);

        if (this.value == null) {
            return;
        }

        this.value = ctx.lower(this.value);

        ctx.edge({
            from: this.value,
            to: this.variable,
            label: "value",
            description: "The value of a variable.",
            example: ["a = ", "b", ""],
        });

        ctx.typeConstraint(this.variable, this.value);

        if (this.type != null) {
            this.type = ctx.lower(this.type);

            ctx.edge({
                from: this.type,
                to: this.variable,
                label: "type",
                description: "The declared type of a variable.",
                example: ["a: ", "int", " = b"],
            });

            ctx.typeConstraint(this.variable, this.type);
        }
    }

    override display?: NodeDisplay = "hidden";
}

export class IntegerNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.int);
    }
}

export class FloatNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.int);
    }
}

export class StringNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.str);
    }
}

abstract class BooleanNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.bool);
    }
}

export class TrueNode extends BooleanNode {}

export class FalseNode extends BooleanNode {}

export class NoneNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.none);
    }
}

export class CallExpressionNode extends Node {
    func: Node;
    inputs: Node[];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.func] = parse(syntaxNode.childForFieldName("function")!);
        this.inputs = parse(syntaxNode.childrenForFieldName("arguments"));
    }

    lower(ctx: LowerContext): Node | void {
        this.inputs = this.inputs.map((input) => ctx.lower(input));
        this.func = ctx.lower(this.func);

        ctx.edge({
            from: this.func,
            to: this,
            label: "function",
            description: "The function being called.",
            example: ["", "print", '("Hello, world!")'],
        });

        for (const input of this.inputs) {
            ctx.edge({
                from: input,
                to: this,
                label: "input",
                description: "The input to the function.",
                example: ["print(", '"Hello, world!"', ")"],
            });
        }

        ctx.typeConstraint(this.func, types.function(this.inputs, this));
    }
}

export class FunctionDefinitionNode extends Node {
    name: string;
    parameters: Node[];
    returnType?: Node;
    body: Node;
    isInClass = false;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.name = syntaxNode.childForFieldName("name")!.text;
        this.parameters = parse(syntaxNode.childrenForFieldName("parameters"));
        [this.returnType] = parse(syntaxNode.childForFieldName("return_type"));
        [this.body] = parse(syntaxNode.childForFieldName("body"));
    }

    lower(ctx: LowerContext): Node | void {
        ctx.pushScope();

        this.parameters = this.parameters.map((parameter) => {
            if (parameter instanceof IdentifierNode) {
                ctx.define(parameter.span.source, parameter);
            }

            return ctx.lower(parameter);
        });

        this.body = ctx.lower(this.body);

        const { returnValues } = ctx.popScope();

        if (
            returnValues.length === 0 &&
            // Type stubs are denoted with `...`
            !((this.body as BlockNode).statements[0] instanceof EllipsisNode)
        ) {
            returnValues.push({ type: types.none });
        }

        if (this.returnType != null) {
            this.returnType = ctx.lower(this.returnType);

            ctx.edge({
                from: this.returnType,
                to: this,
                label: "return type",
                description: "The return type of the function.",
                example: ["def increment(x) -> ", "int", ": return x + 1"],
            });

            ctx.typeConstraint(this, types.function(this.parameters, this.returnType));
        }

        for (const parameter of this.parameters) {
            ctx.edge({
                from: parameter,
                to: this,
                label: "parameter",
                description: "A parameter within the function.",
                example: ["def increment(", "x", "): return x + 1"],
            });
        }

        for (const returnValue of returnValues) {
            if (returnValue.value != null) {
                ctx.edge({
                    from: returnValue.value,
                    to: this,
                    label: "return value",
                    description: "The return value of a function.",
                    example: ["def increment(x): ", "return x + 1", ""],
                });
            }

            ctx.typeConstraint(this, types.function(this.parameters, returnValue.type));

            if (this.returnType != null) {
                ctx.typeConstraint(this.returnType, returnValue.type);
            }
        }

        if (!this.isInClass) {
            ctx.define(this.name, this);
        }
    }
}

export class ListNode extends Node {
    elements: Node[];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.elements = parse(syntaxNode.children);
    }

    lower(ctx: LowerContext): Node | void {
        this.elements = this.elements.map((element) => ctx.lower(element));

        for (const element of this.elements) {
            ctx.edge({
                from: element,
                to: this,
                label: "element",
                description: "An element of a list.",
                example: ["[", "1", ", 2, 3]"],
            });
        }

        const elementType = this.elements[0] ?? null;
        for (const child of this.elements.slice(1)) {
            ctx.typeConstraint(child, elementType);
        }

        ctx.typeConstraint(this, types.list(elementType));
    }
}

export class SubscriptNode extends Node {
    value: Node;
    subscript: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.value] = parse(syntaxNode.childForFieldName("value")!);
        [this.subscript] = parse(syntaxNode.childForFieldName("subscript")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.value = ctx.lower(this.value);
        this.subscript = ctx.lower(this.subscript);

        ctx.edge({
            from: this.value,
            to: this,
            label: "list",
            description: "The list being indexed.",
            example: ["", "numbers", "[0]"],
        });

        ctx.edge({
            from: this.subscript,
            to: this,
            label: "index",
            description: "The index of the element being accessed. Must be an int.",
            example: ["numbers[", "0", "]"],
        });

        ctx.typeConstraint(this.subscript, types.int);
        ctx.typeConstraint(this.value, types.list(this));
    }
}

export class BinaryExpressionNode extends Node {
    left: Node;
    right: Node;
    operator: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.left] = parse(syntaxNode.childForFieldName("left"));
        this.operator = syntaxNode.childForFieldName("operator")!.text;
        [this.right] = parse(syntaxNode.childForFieldName("right"));
    }

    lower(ctx: LowerContext): Node | void {
        this.left = ctx.lower(this.left);
        this.right = ctx.lower(this.right);

        if (!(this.operator in operators)) {
            this.display = "hidden";
            return;
        }

        ctx.edge({
            from: this.left,
            to: this,
            label: "left",
            description: "The first input to the operator.",
            example: ["", "a", ` ${this.operator} b`],
        });

        ctx.edge({
            from: this.right,
            to: this,
            label: "right",
            description: "The second input to the operator.",
            example: [`a ${this.operator} `, "b", ""],
        });

        const operatorConstraints = operators[this.operator];
        const { types = [], overloads = [] } = operatorConstraints(this.left, this.right, this);

        for (const { node, type } of types) {
            ctx.typeConstraint(node, type);
        }

        if (overloads.length > 0) {
            ctx.overloadConstraint(overloads);
        }
    }
}

export class ComparisonExpressionNode extends Node {
    left: Node;
    right: Node;
    operator: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.left] = parse(syntaxNode.children[0]);
        this.operator = syntaxNode.childForFieldName("operators")!.text;
        [this.right] = parse(syntaxNode.children[2]);
    }

    lower(ctx: LowerContext): Node | void {
        this.left = ctx.lower(this.left);
        this.right = ctx.lower(this.right);

        if (!(this.operator in operators)) {
            this.display = "hidden";
            return;
        }

        ctx.edge({
            from: this.left,
            to: this,
            label: "left",
            description: "The first input to the operator.",
            example: ["", "a", ` ${this.operator} b`],
        });

        ctx.edge({
            from: this.right,
            to: this,
            label: "right",
            description: "The second input to the operator.",
            example: [`a ${this.operator} `, "b", ""],
        });

        const operatorConstraints = operators[this.operator];
        const { types = [], overloads = [] } = operatorConstraints(this.left, this.right, this);

        for (const { node, type } of types) {
            ctx.typeConstraint(node, type);
        }

        if (overloads.length > 0) {
            ctx.overloadConstraint(overloads);
        }
    }
}

export class BlockNode extends Node {
    statements: Node[];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.statements = parse(syntaxNode.children);
    }

    lower(ctx: LowerContext): Node | void {
        this.statements = this.statements.map((statement) => ctx.lower(statement));
    }

    override display?: NodeDisplay = "hidden";
}

export class IfStatementNode extends Node {
    condition: Node;
    thenNode: Node;
    elseNode: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.condition] = parse(syntaxNode.childForFieldName("condition"));
        [this.thenNode] = parse(syntaxNode.childForFieldName("consequence"));
        [this.elseNode] = parse(syntaxNode.childForFieldName("alternative"));
    }

    lower(ctx: LowerContext): Node | void {
        this.condition = ctx.lower(this.condition);
        this.thenNode = ctx.lower(this.thenNode);

        if (this.elseNode != null) {
            this.elseNode = ctx.lower(this.elseNode);
        }

        ctx.edge({
            from: this.condition,
            to: this,
            label: "condition",
            description: "The condition in an if statement. Must be a bool.",
            example: ["if ", "x == 0", ":"],
        });

        ctx.typeConstraint(this.condition, types.bool);
        ctx.typeConstraint(this, this.thenNode);

        if (this.elseNode != null) {
            ctx.typeConstraint(this, this.elseNode);
        }
    }

    override display?: NodeDisplay = "untyped";
}

export class ConditionalExpressionNode extends Node {
    thenNode: Node;
    condition: Node;
    elseNode: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        const [thenNode, condition, elseNode] = parse(syntaxNode.children);
        this.thenNode = thenNode;
        this.condition = condition;
        this.elseNode = elseNode;
    }

    lower(ctx: LowerContext): Node | void {
        this.condition = ctx.lower(this.condition);
        this.thenNode = ctx.lower(this.thenNode);
        this.elseNode = ctx.lower(this.elseNode);

        ctx.edge({
            from: this.condition,
            to: this,
            label: "condition",
            description: "The condition in a conditional expression. Must be a bool.",
            example: ["a if ", "x == 0", " else b"],
        });

        ctx.edge({
            from: this.thenNode,
            to: this,
            label: "then",
            description: "Runs if the condition is true.",
            example: ["", "a", " if x == 0 else b"],
        });

        ctx.edge({
            from: this.elseNode,
            to: this,
            label: "else",
            description: "Runs if the condition is false.",
            example: ["a if x == 0 else ", "b", ""],
        });

        ctx.typeConstraint(this.condition, types.bool);
        ctx.typeConstraint(this, this.thenNode);
        ctx.typeConstraint(this, this.elseNode);
    }
}

export class ReturnStatementNode extends Node {
    value: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.value] = parse(syntaxNode.children);
    }

    lower(ctx: LowerContext): Node | void {
        if (this.value != null) {
            this.value = ctx.lower(this.value);

            ctx.scope().returnValues.push({
                statement: this,
                value: this.value,
                type: this.value,
            });

            ctx.edge({
                from: this.value,
                to: this,
                label: "value",
                description: "The value being returned.",
                example: ["return ", "x", ""],
            });
        }
    }

    override display?: NodeDisplay = "untyped";
}

export class ClassDefinitionNode extends Node {
    name: string;
    methods: Node[] = [];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);

        this.name = syntaxNode.childForFieldName("name")!.text;

        for (const child of parse(syntaxNode.childForFieldName("body")!.namedChildren)) {
            if (child instanceof FunctionDefinitionNode) {
                child.isInClass = true;
                this.methods.push(child);
            }
        }
    }

    lower(ctx: LowerContext): Node | void {
        // Note: Do not create a scope

        const selfType = types.named(this, [], this.name);

        ctx.withThisType(selfType, () => {
            this.methods = this.methods.map((method) => ctx.lower(method));
        });

        ctx.define(`class ${this.name}`, this);

        for (const method of this.methods) {
            ctx.edge({
                from: method,
                to: this,
                label: "method",
                description: "A method of the class.",
                example: ["class MyClass: ", "def increment(self, x)", ""],
            });
        }
    }

    override display: NodeDisplay = "untyped";
}

export class ForStatementNode extends Node {
    left: Node;
    right: Node;
    body: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.left] = parse(syntaxNode.childForFieldName("left")!);
        [this.right] = parse(syntaxNode.childForFieldName("right")!);
        [this.body] = parse(syntaxNode.childForFieldName("body")!);
    }

    lower(ctx: LowerContext): Node | void {
        ctx.pushScope();

        this.left = ctx.lower(this.left);
        this.right = ctx.lower(this.right);
        this.body = ctx.lower(this.body);

        ctx.edge({
            from: this.left,
            to: this,
            label: "element",
            description: "The current element in this iteration of the loop.",
            example: ["for ", "i", " in range(3): print(i)"],
        });

        ctx.edge({
            from: this.right,
            to: this,
            label: "item",
            description: "The list or range being iterated over.",
            example: ["for i in ", "range(3)", ": print(i)"],
        });

        ctx.edge({
            from: this.body,
            to: this,
            label: "body",
            description: "The body of the loop.",
            example: ["for i in range(3): ", "print(i)", ""],
        });

        ctx.typeConstraint(this.right, types.list(this.left));

        ctx.popScope();
    }
}

export class TypedParameterNode extends Node {
    name: Node;
    type: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.name] = parse(syntaxNode.children[0]);
        [this.type] = parse(syntaxNode.childForFieldName("type")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.type = ctx.lower(this.type);
        this.name = ctx.lower(this.name);

        ctx.edge({
            from: this.type,
            to: this.name,
            label: "type",
            description: "The type of the parameter.",
            example: ["x: ", "int", ""],
        });

        ctx.typeConstraint(this.name, this.type);
        ctx.typeConstraint(this, this.type);

        return this.name;
    }

    override display?: NodeDisplay = "hidden";
}

export class EllipsisNode extends Node {
    lower(_ctx: LowerContext): Node | void {}

    display?: NodeDisplay = "hidden";
}
