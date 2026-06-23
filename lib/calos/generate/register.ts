import { registerGenerator } from "./contract";
import { thinkforgeGenerator } from "./generators/thinkforge";

/**
 * Wire the live generators. Import this module for its side effects before calling getGenerator
 * (the dispatch endpoint does). Add more services here as their generators are built.
 */
registerGenerator("thinkforge", thinkforgeGenerator);
