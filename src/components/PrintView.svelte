<script lang="ts">
    import * as compiler from "@/compiler";
    import html2pdf from "html2pdf.js";
    import Node from "./Node.svelte";
    import { nodeMargin } from "@/util/layout";

    interface Props {
        code: string;
        errorMessage?: string;
        nodes: compiler.Node[];
        onfinish: () => void;
    }

    const { code, errorMessage, nodes, onfinish }: Props = $props();

    let container: HTMLDivElement;

    const margin = 0.5;
    const width = 8.5 - margin * 2;
    const height = 11 - margin * 2;

    const widthPx = width * 60;
    const heightPx = height * 60;

    // Split nodes across multiple pages
    $effect(() => {
        container.style.width = `${widthPx}px`;

        const createPageContainer = () => {
            const pageContainer = document.createElement("div");
            pageContainer.style.width = `${widthPx}px`;
            pageContainer.style.height = `${heightPx}px`;
            return pageContainer;
        };

        let y: number | undefined = undefined;
        let totalHeight = 0;
        let currentContainer = createPageContainer();
        let currentChildren: HTMLElement[] = [];
        const pageContainers: { container: HTMLDivElement; children: HTMLElement[] }[] = [];
        container.childNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) {
                return;
            }

            let { bottom, height } = node.getBoundingClientRect();
            height += nodeMargin * 2;

            if (y == null || bottom > y) {
                if (y != null) {
                    totalHeight += bottom - y;
                } else {
                    totalHeight = height;
                }

                y = bottom;

                if (totalHeight > heightPx) {
                    totalHeight = 0;

                    // Add a new page
                    pageContainers.push({
                        container: currentContainer,
                        children: currentChildren,
                    });
                    currentContainer = createPageContainer();
                    currentChildren = [];
                }
            }

            currentChildren.push(node);
        });

        pageContainers.push({ container: currentContainer, children: currentChildren });

        for (const { container: pageContainer, children } of pageContainers) {
            for (const child of children) {
                pageContainer.appendChild(child);
            }

            container.appendChild(pageContainer);
        }
    });

    const print = async () => {
        const scale = 4;
        const filename = `typecircuits-${Date.now()}.pdf`;

        await html2pdf(container, {
            filename,
            margin,
            html2canvas: {
                scale,
                width: widthPx,
            },
            jsPDF: {
                unit: "in",
                format: "letter",
                orientation: "portrait",
            },
        } as any);

        onfinish();
    };

    $effect(() => {
        requestAnimationFrame(() => {
            print();
        });
    });
</script>

<div bind:this={container}>
    <div
        class="mb-[20px] flex w-fit flex-col gap-[20px] font-mono text-[18px] leading-relaxed whitespace-pre-wrap"
    >
        <p>{code}</p>

        {#if errorMessage}
            <p class="rounded-lg border-[1.5px] border-gray-400 p-[10px]">
                {errorMessage}
            </p>
        {/if}
    </div>

    {#each nodes as node}
        <div class="inline-block">
            <Node data={{ node }} scale={1.5} inGraph={false} />
        </div>
    {/each}
</div>
