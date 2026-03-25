import treeSitterPython from "tree-sitter-python/tree-sitter-python.wasm?url";
import { compiler } from "@/compiler/index";
import * as nodes from "./nodes";

const defaultOptions = {};

export default await compiler(treeSitterPython, defaultOptions, {
    identifier: nodes.IdentifierNode,
    attribute: nodes.AttributeNode,
    assignment: nodes.AssignmentNode,
    integer: nodes.IntegerNode,
    float: nodes.FloatNode,
    string: nodes.StringNode,
    true: nodes.TrueNode,
    false: nodes.FalseNode,
    none: nodes.NoneNode,
    call: nodes.CallExpressionNode,
    function_definition: nodes.FunctionDefinitionNode,
    list: nodes.ListNode,
    subscript: nodes.SubscriptNode,
    binary_operator: nodes.BinaryExpressionNode,
    comparison_operator: nodes.ComparisonExpressionNode,
    boolean_operator: nodes.BinaryExpressionNode,
    block: nodes.BlockNode,
    if_statement: nodes.IfStatementNode,
    conditional_expression: nodes.ConditionalExpressionNode,
    return_statement: nodes.ReturnStatementNode,
    class_definition: nodes.ClassDefinitionNode,
    for_statement: nodes.ForStatementNode,
    typed_parameter: nodes.TypedParameterNode,
    ellipsis: nodes.EllipsisNode,
});
