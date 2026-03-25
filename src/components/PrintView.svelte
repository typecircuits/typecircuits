<script lang="ts">
    import * as compiler from "@/compiler";
    import { jsPDF } from "jspdf";
    import html2canvas from "html2canvas-pro";
    import Node from "./Node.svelte";

    interface Props {
        code: string;
        errorMessage?: string;
        nodes: compiler.Node[];
        onfinish: () => void;
    }

    const { code, errorMessage, nodes, onfinish }: Props = $props();

    let container: HTMLDivElement;

    const print = async () => {
        const scale = 4;
        const margin = 0.5;
        const width = 8.5 - margin * 2;
        const height = 11 - margin * 2;
        const filename = `typecircuits-${Date.now()}.pdf`;

        container.style.width = `${width * 60}px`;
        container.style.height = `${height * 60}px`;

        const canvas = await html2canvas(container, {
            scale,
            width: width * 60,
            height: height * 60,
        });

        const pdf = new jsPDF({
            unit: "in",
            format: "letter",
            orientation: "portrait",
            compress: true,
        });

        pdf.setProperties({ title: filename });

        pdf.addImage({
            imageData: canvas.toDataURL("image/png"),
            format: "PNG",
            x: margin,
            y: margin,
            width,
            height,
        });

        pdf.output("dataurlnewwindow", { filename });

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
        class="mb-[20px] flex w-fit flex-col gap-[20px] font-mono text-[10px] leading-relaxed font-semibold whitespace-pre-wrap"
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
            <Node data={{ node }} inGraph={false} />
        </div>
    {/each}
</div>
