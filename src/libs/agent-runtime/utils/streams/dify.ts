import { convertIterableToStream, createCallbacksTransformer, createSSEProtocolTransformer, StreamProtocolChunk, StreamStack } from ".";
import { ChatStreamCallbacks } from "../..";

interface DifyChunk {
    event: string;
    task_id?: string;
    answer?: string;
    message?: string; // 错误信息
    message_id?: string;
    id?: string
}

const processDifyData = (buffer: string): DifyChunk => {
    try {
        // Remove the prefix `data:`
        if (buffer.startsWith('data:'))
            return JSON.parse(buffer.slice(5).trim()) as DifyChunk
        return JSON.parse(buffer.trim())
    } catch (error) {
        // console.error('[Dify - transformDifyStream - processDifyData]: ', {
        //     error,
        //     buffer,
        // })
    }
    return { raw: buffer } as any
}

export const transformDifyStream = (buffer: Uint8Array): StreamProtocolChunk => {
    const decoder = new TextDecoder()
    const chunk = processDifyData(decoder.decode(buffer, { stream: true }))
    let type: StreamProtocolChunk['type'] = 'dify'
    if (chunk.event === 'message_end') {
        type = 'stop'
    }
    return {
        id: chunk?.task_id ?? chunk?.id,
        data: chunk,
        type: type,
    }
}

export const DifyStream = (stream: ReadableStream, callbacks?: ChatStreamCallbacks) => {
    return stream
        .pipeThrough(createSSEProtocolTransformer(transformDifyStream))
        .pipeThrough(createCallbacksTransformer(callbacks));
};