  export interface Logprobs {
    tokens: string[];
    token_logprobs: number[];
    top_logprobs?: any;
    text_offset: number[];
  }

  export interface Choice {
    text: string;
    index: number;
    logprobs: Logprobs;
    finish_reason: string;
  }

  export interface Usage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }

  export interface OpenAIREsponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Choice[];
    usage: Usage;
  }

