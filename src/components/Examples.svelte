<script lang="ts">
    import { examples, type Example } from "@/examples";
    import Icon from "./Icon.svelte";
    import Visualizer from "@/visualizers/circuit/CircuitVisualizer.svelte";
    import Dropdown from "./Dropdown.svelte";
    import { defaultShow, type Show } from "@/App.svelte";
    import { makeCompiler } from "@/core/compiler";
    import { context } from "@/context.svelte";
    import { allLanguages } from "@/core/languages";

    interface Props {
        onclick: (example: Example) => void;
        onclose: () => void;
    }

    let { onclick, onclose }: Props = $props();

    const compileExample = async (example: Example, show: Show) => {
        const parsed = await context.language!.parse(example.code);

        const compiler = makeCompiler({ show });
        await context.language!.compile(parsed, compiler);
        return compiler.finish();
    };
</script>

<div class="flex size-full flex-col">
    <div class="flex flex-row items-center justify-between px-[20px] pt-[20px]">
        <h1 class="font-semibold">
            Examples for&nbsp;
            <Dropdown
                options={allLanguages}
                optionName={(language) => language.name}
                bind:selection={context.language!}
            />
        </h1>

        <button
            onclick={onclose}
            class="flex aspect-square items-center justify-center self-end rounded-full bg-gray-100 p-[6px] transition hover:bg-gray-200"
        >
            <Icon>close</Icon>
        </button>
    </div>

    <div class="grid grid-cols-3 gap-[10px] overflow-scroll px-[20px] pb-[20px]">
        {#each Object.entries(examples) as [title, section]}
            {#if context.language!.name in section}
                <h2 class="col-span-3 mt-[20px] text-xl font-semibold">{title}</h2>

                {#each section[context.language!.name] as example}
                    {@const show = { ...defaultShow, ...example.show }}

                    <button
                        onclick={() => onclick(example)}
                        class="flex cursor-pointer flex-col gap-[4px] rounded-[10px] border-2 border-gray-50 p-[10px] hover:bg-gray-50"
                    >
                        <p class="text-left font-semibold">{example.title}</p>

                        {#if example.errorMessage}
                            <p
                                class="rounded-lg bg-red-50 px-[8px] py-[6px] text-left font-mono text-xs text-red-500"
                            >
                                {example.errorMessage}
                            </p>
                        {/if}

                        <div class="flex h-[175px]">
                            {#await compileExample(example, show) then compileResult}
                                <Visualizer
                                    {compileResult}
                                    preview
                                    {show}
                                    selections={example.selections ?? []}
                                    hiddenNodes={example.hiddenNodes ?? []}
                                />
                            {/await}
                        </div>
                    </button>
                {/each}
            {/if}
        {/each}
    </div>
</div>
