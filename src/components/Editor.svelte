<script lang="ts">
    import { Compartment, EditorSelection, EditorState, Prec } from "@codemirror/state";
    import {
        EditorView,
        highlightActiveLine,
        keymap,
        lineNumbers,
        placeholder,
    } from "@codemirror/view";
    import { minimalSetup } from "codemirror";
    import { githubLight } from "@uiw/codemirror-theme-github";
    import { indentWithTab } from "@codemirror/commands";
    import {
        syntaxHighlighting,
        defaultHighlightStyle,
        indentUnit,
        HighlightStyle,
    } from "@codemirror/language";
    import { closeBrackets } from "@codemirror/autocomplete";
    import { tags } from "@lezer/highlight";
    import { onMount } from "svelte";
    import equal from "fast-deep-equal";
    import { highlightGroups, setHighlightGroups } from "codemirror-highlight-groups";
    import { context } from "@/context.svelte";
    import Tooltip from "./Tooltip.svelte";

    interface Props {
        fontSize: string;
        lineHeight: string;
        readOnly: boolean;
        onshowexamples: () => void;
    }

    let { fontSize, lineHeight, readOnly, onshowexamples }: Props = $props();

    let editor: HTMLDivElement;
    let hadFocus = $state(false);

    let placeholderElement: HTMLDivElement;

    let hoverState = $state<{ element: HTMLElement; groupId: string }>();

    let view: EditorView;
    onMount(() => {
        view = new EditorView({
            doc: context.code,
            parent: editor,
            extensions: [
                minimalSetup,
                Prec.high([
                    syntaxHighlighting(
                        HighlightStyle.define([
                            {
                                tag: tags.variableName,
                                color: "unset",
                            },
                        ]),
                    ),
                    githubLight,
                ]),
                lineNumbers(),
                readOnlyExtensions.of([]),
                closeBrackets(),
                languageExtension.of([]),
                syntaxHighlighting(defaultHighlightStyle),
                indentUnit.of(" ".repeat(4)),
                keymap.of([indentWithTab]),
                placeholder(() => {
                    const placeholder = placeholderElement;
                    placeholder.classList.remove("hidden");
                    return placeholder;
                }),
                EditorView.lineWrapping,
                EditorState.allowMultipleSelections.of(true),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        context.code = update.state.doc.toString();
                        hoverState = undefined;
                    }

                    if (update.selectionSet && !$effect.tracking()) {
                        const newSelections = update.state.selection.ranges
                            .map((range): [number, number] => [range.from, range.to])
                            .filter(([from, to]) => from !== to);

                        if (!equal(newSelections, context.selections)) {
                            context.selections = newSelections;
                        }
                    }

                    if (update.focusChanged && update.view.hasFocus) {
                        hadFocus = true;
                    }
                }),
                highlightGroups({
                    groupClassName: "group",
                    onmouseover: (element, groupId) => {
                        hoverState = { element, groupId };
                    },
                    onmouseout: () => {
                        hoverState = undefined;
                    },
                }),
            ],
        });
    });

    const updateSelections = (selections: [number, number][]) => {
        if (selections.length > 0) {
            view.dispatch({
                selection: EditorSelection.create(
                    selections.map(([from, to]) => EditorSelection.range(from, to)),
                ),
            });
        }
    };

    onMount(() => {
        view.focus();
    });

    $effect(() => {
        if (context.code === view.state.doc.toString()) {
            return;
        }

        view.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: context.code,
            },
        });
    });

    $effect(() => {
        updateSelections(context.selections);
    });

    const readOnlyExtensions = new Compartment();

    $effect(() => {
        view.dispatch({
            effects: readOnlyExtensions.reconfigure([
                readOnly ? [] : highlightActiveLine(),
                EditorState.readOnly.of(readOnly),
                EditorView.editable.of(!readOnly),
            ]),
        });
    });

    const languageExtension = new Compartment();

    $effect(() => {
        context.language;

        (async () => {
            const extensions = (await context.language?.editorExtensions?.()) ?? [];

            view.dispatch({
                effects: languageExtension.reconfigure(extensions),
            });
        })();
    });

    $effect(() => {
        const groups = Object.fromEntries(
            context.compileResult?.groups.map((group, index) => [
                index.toString(),
                {
                    // Use `nodes` instead of `displayNodes` to show even replaced nodes
                    ranges: group.nodes.map((node) => node.pos),
                },
            ]) ?? [],
        );

        view.dispatch({
            effects: setHighlightGroups.of(groups),
        });
    });
</script>

<div
    bind:this={editor}
    data-hadFocus={hadFocus || undefined}
    class="flex-1"
    style:--font-size={fontSize}
    style:--line-height={lineHeight}
></div>

<div bind:this={placeholderElement} class="hidden">
    Paste your code here, or
    <button onclick={onshowexamples} class="pointer-events-auto cursor-pointer text-blue-500">
        browse examples
    </button>
</div>

{#if hoverState != null}
    {@const { element, groupId } = hoverState}
    {@const types = context.compileResult?.groups[parseFloat(groupId)].types}

    {#if types != null}
        <Tooltip reference={element} delay={500}>
            {#snippet content()}
                <div
                    class="flex flex-row items-baseline gap-[1ch] font-mono"
                    style:font-size="calc({fontSize} * 0.8)"
                >
                    {#each types as type, index (type)}
                        {#if index > 0}
                            <span class="opacity-50">or</span>
                        {/if}

                        <code>{type}</code>
                    {/each}
                </div>
            {/snippet}
        </Tooltip>
    {/if}
{/if}

<style>
    :global(.cm-editor) {
        width: 100%;
        height: 100%;

        --group-size: calc(var(--font-size) / 4);

        &.cm-focused {
            outline: none;
        }

        & .cm-scroller {
            font-size: var(--font-size);
            font-family: var(--font-mono);
            line-height: var(--line-height);
        }

        & .cm-gutters {
            background: none;
        }

        & .cm-gutterElement {
            margin-right: 4px;
        }

        & .cm-cursor {
            border-radius: 4px;
            border-left-width: 2px;
            border-left-color: var(--color-blue-500);
        }

        & .group {
            border-radius: var(--group-size);
            outline: calc(var(--group-size) / 4) solid transparent;
            background-color: transparent;
            transition:
                outline 0.1s,
                background-color 0.1s;
        }

        & .group[data-group-highlighted] {
            outline: calc(var(--group-size) / 4) solid
                color-mix(in srgb, var(--color-blue-500) 80%, transparent);
            background-color: color-mix(in srgb, var(--color-blue-500) 15%, transparent);
        }
    }

    :not([data-hadFocus]) {
        :global(.cm-editor .cm-activeLineGutter),
        :global(.cm-editor .cm-activeLine) {
            background: none;
        }
    }
</style>
