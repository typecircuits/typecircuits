<script lang="ts">
    import { examples, type Example } from "@/examples";
    import Icon from "./Icon.svelte";
    import Visualizer from "./Visualizer.svelte";
    import LanguageDropdown from "./LanguageDropdown.svelte";
    import { defaultOptions } from "@/App.svelte";
    import type * as compiler from "@/compiler";

    interface Props {
        language: compiler.Language;
        resolvedLanguage: Promise<compiler.ResolvedLanguage> | undefined;
        onclick: (example: Example) => void;
        onclose: () => void;
    }

    let { language = $bindable(), resolvedLanguage, onclick, onclose }: Props = $props();
</script>

<div class="flex size-full flex-col">
    <div class="flex flex-row items-center justify-between px-[20px] pt-[20px]">
        <h1 class="font-semibold">
            Examples for&nbsp;
            <LanguageDropdown bind:selection={language} />
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
            {#if language.name in section}
                <h2 class="col-span-3 mt-[20px] text-xl font-semibold">{title}</h2>

                {#each section[language.name] as example}
                    {@const options = { ...defaultOptions, ...example.options }}

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
                            {#await resolvedLanguage then resolvedLanguage}
                                {#if resolvedLanguage != null}
                                    <Visualizer
                                        preview
                                        {options}
                                        selections={example.selections ?? []}
                                        compileResult={resolvedLanguage.compile(
                                            example.code,
                                            options,
                                        )}
                                    />
                                {/if}
                            {/await}
                        </div>
                    </button>
                {/each}
            {/if}
        {/each}
    </div>
</div>
