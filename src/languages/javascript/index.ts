import treeSitterJavascript from "tree-sitter-javascript/tree-sitter-javascript.wasm?url";
import { compiler } from "@/compiler/index";
import * as nodes from "./nodes";

const defaultOptions = {};

export default compiler(treeSitterJavascript, defaultOptions, {
    identifier: nodes.IdentifierNode,
    property_identifier: nodes.PropertyIdentifierNode,
    member_expression: nodes.MemberExpressionNode,
    variable_declarator: nodes.VariableDeclaratorNode,
    assignment_expression: nodes.AssignmentExpressionNode,
    number: nodes.NumberNode,
    string: nodes.StringNode,
    true: nodes.TrueNode,
    false: nodes.FalseNode,
    null: nodes.NullNode,
    call_expression: nodes.CallExpressionNode,
    arrow_function: nodes.ArrowFunctionNode,
    function_expression: nodes.FunctionExpressionNode,
    function_declaration: nodes.FunctionDeclarationNode,
    array: nodes.ArrayNode,
    subscript_expression: nodes.SubscriptExpressionNode,
    binary_expression: nodes.BinaryExpressionNode,
    statement_block: nodes.StatementBlockNode,
    if_statement: nodes.IfStatementNode,
    ternary_expression: nodes.TernaryExpressionNode,
    return_statement: nodes.ReturnStatementNode,
    update_expression: nodes.UpdateExpressionNode,
});
