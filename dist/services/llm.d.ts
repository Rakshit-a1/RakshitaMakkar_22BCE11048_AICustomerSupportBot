export type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};
export interface LLMService {
    generate(messages: ChatMessage[], opts?: {
        temperature?: number;
    }): Promise<string>;
    summarize(messages: ChatMessage[]): Promise<string>;
    suggestNextActions(messages: ChatMessage[]): Promise<string[]>;
}
export declare function createLLM(): LLMService;
//# sourceMappingURL=llm.d.ts.map