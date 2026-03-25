import type * as ts from "web-tree-sitter";
import { Node, type NodeDisplay, type Parse } from "@/compiler/lower/node";
import type { LowerContext } from "@/compiler/lower";
import * as types from "./types";
import { operators } from "./operators";
import { tryBuiltin } from "./builtins";
import type { Type } from "@/compiler/typecheck/type";

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

        if (tryBuiltin(this.name, this, ctx)) {
            return;
        }

        return ctx.resolve(this.name, this);
    }
}

export class PropertyIdentifierNode extends Node {
    override display?: NodeDisplay = "hidden";

    lower(ctx: LowerContext): Node | void {}
}

export class MemberExpressionNode extends Node {
    object: Node;
    property: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.object] = parse(syntaxNode.childForFieldName("object")!);
        [this.property] = parse(syntaxNode.childForFieldName("property")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.object.display = "hidden"; // place before lowering so only non-replaced nodes are hidden
        this.object = ctx.lower(this.object);

        this.property = ctx.lower(this.property);

        ctx.edge({
            from: this.object,
            to: this,
            label: "object",
            description: "The object containing the property.",
            example: ["", "console", ".log"],
        });

        tryBuiltin(`${this.object.span.source}.${this.property.span.source}`, this, ctx);
    }
}

abstract class AssignmentNode extends Node {
    abstract variable: Node;
    abstract value: Node | undefined;

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
    }
}

export class VariableDeclaratorNode extends AssignmentNode {
    variable: Node;
    value: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.variable] = parse(syntaxNode.childForFieldName("name")!);
        [this.value] = parse(syntaxNode.childForFieldName("value"));
    }

    override display: NodeDisplay = "hidden";
}

export class AssignmentExpressionNode extends AssignmentNode {
    variable: Node;
    value: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.variable] = parse(syntaxNode.childForFieldName("left")!);
        [this.value] = parse(syntaxNode.childForFieldName("right")!);
    }

    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);

        ctx.typeConstraint(this, this.value);

        ctx.edge({
            from: this.value,
            to: this,
            label: "value",
            description: "This assignment also produces the value of the variable.",
            example: ["a = ", "b", ""],
        });
    }

    override display?: NodeDisplay = "hidden";
}

export class NumberNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.number);
    }
}

export class StringNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.string);
    }
}

abstract class BooleanNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.boolean);
    }
}

export class TrueNode extends BooleanNode {}

export class FalseNode extends BooleanNode {}

export class NullNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.null);
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
            example: ["", "console.log", '("Hello, world!")'],
        });

        for (const input of this.inputs) {
            ctx.edge({
                from: input,
                to: this,
                label: "input",
                description: "The input to the function.",
                example: ["console.log(", '"Hello, world!"', ")"],
            });
        }

        ctx.typeConstraint(this.func, types.function(this.inputs, this));
    }
}

abstract class BaseFunctionNode extends Node {
    abstract defaultReturnType(): Type;

    parameters: Node[];
    body: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.parameters = parse(syntaxNode.childrenForFieldName("parameters"));
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

        if (returnValues.length === 0) {
            const type = this.defaultReturnType();
            const value = type instanceof Node ? type : undefined;
            returnValues.push({ type, value });
        }

        for (const parameter of this.parameters) {
            ctx.edge({
                from: parameter,
                to: this,
                label: "parameter",
                description: "A parameter within the function.",
                example: ["(x) => ", "x", " + 1"],
            });
        }

        for (const returnValue of returnValues) {
            if (returnValue.value != null) {
                ctx.edge({
                    from: returnValue.value,
                    to: this,
                    label: "return value",
                    description: "The return value of a function.",
                    example: ["(x) => ", "x + 1", ""],
                });
            }

            ctx.typeConstraint(this, types.function(this.parameters, returnValue.type));
        }
    }
}

export class ArrowFunctionNode extends BaseFunctionNode {
    defaultReturnType(): Type {
        return this.body;
    }
}

export class FunctionExpressionNode extends BaseFunctionNode {
    defaultReturnType(): Type {
        return types.void;
    }
}

export class FunctionDeclarationNode extends BaseFunctionNode {
    name: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.name = syntaxNode.childForFieldName("name")!.text;
    }

    defaultReturnType(): Type {
        return types.void;
    }

    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);

        ctx.define(this.name, this);
    }
}

export class ArrayNode extends Node {
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
                description: "An element of an array.",
                example: ["[", "1", ", 2, 3]"],
            });
        }

        const elementType = this.elements[0] ?? null;
        for (const child of this.elements.slice(1)) {
            ctx.typeConstraint(child, elementType);
        }

        ctx.typeConstraint(this, types.array(elementType));
    }
}

export class SubscriptExpressionNode extends Node {
    object: Node;
    index: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.object] = parse(syntaxNode.childForFieldName("object")!);
        [this.index] = parse(syntaxNode.childForFieldName("index")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.object = ctx.lower(this.object);
        this.index = ctx.lower(this.index);

        ctx.edge({
            from: this.object,
            to: this,
            label: "array",
            description: "The array being indexed.",
            example: ["", "numbers", "[0]"],
        });

        ctx.edge({
            from: this.index,
            to: this,
            label: "index",
            description: "The index of the element being accessed. Must be a number.",
            example: ["numbers[", "0", "]"],
        });

        ctx.typeConstraint(this.index, types.number);
        ctx.typeConstraint(this.object, types.array(this));
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

export class StatementBlockNode extends Node {
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
            description: "The condition in an if statement. Must be a boolean.",
            example: ["if (", "x == 0", ")"],
        });

        ctx.typeConstraint(this.condition, types.boolean);
        ctx.typeConstraint(this, this.thenNode);

        if (this.elseNode != null) {
            ctx.typeConstraint(this, this.elseNode);
        }
    }

    override display?: NodeDisplay = "untyped";
}

export class TernaryExpressionNode extends Node {
    condition: Node;
    thenNode: Node;
    elseNode: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.condition] = parse(syntaxNode.childForFieldName("condition"));
        [this.thenNode] = parse(syntaxNode.childForFieldName("consequence"));
        [this.elseNode] = parse(syntaxNode.childForFieldName("alternative"));
    }

    lower(ctx: LowerContext): Node | void {
        this.condition = ctx.lower(this.condition);
        this.thenNode = ctx.lower(this.thenNode);
        this.elseNode = ctx.lower(this.elseNode);

        ctx.edge({
            from: this.condition,
            to: this,
            label: "condition",
            description: "The condition in a ternary expression. Must be a boolean.",
            example: ["", "x == 0", " ? a : b"],
        });

        ctx.edge({
            from: this.thenNode,
            to: this,
            label: "then",
            description: "Runs if the condition is true.",
            example: ["x == 0 ? ", "a", " : b"],
        });

        ctx.edge({
            from: this.elseNode,
            to: this,
            label: "else",
            description: "Runs if the condition is false.",
            example: ["x == 0 ? a : ", "b", ""],
        });

        ctx.typeConstraint(this.condition, types.boolean);
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
            console.log({ scope: ctx.scope(), node: this });

            ctx.edge({
                from: this.value,
                to: this,
                label: "value",
                description: "The value being returned.",
                example: ["return ", "x", ";"],
            });
        }
    }

    override display?: NodeDisplay = "untyped";
}

export class UpdateExpressionNode extends Node {
    value: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.value] = parse(syntaxNode.childForFieldName("argument")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.value = ctx.lower(this.value);

        ctx.edge({
            from: this.value,
            to: this,
            label: "value",
            description: "The value being updated. Must be a number.",
            example: ["", "i", "++"],
        });

        ctx.typeConstraint(this.value, types.number);
        ctx.typeConstraint(this, this.value);
    }
}
