import {type Agent,handoff} from "@openai/agents";
import type { AppContext } from "./agent-context.js";

export function asHandoff(agent:Agent<AppContext,"text">){
    return handoff(agent as unknown as Agent<unknown,"text">);
}