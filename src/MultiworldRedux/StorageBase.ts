import { INetworkPlayer } from "modloader64_api/NetworkHandler";
import { OutgoingItem } from "./OutgoingItem";

export class MWRStorage {
    players: Map<number, INetworkPlayer[]> = new Map<number, INetworkPlayer[]>();
    itemLog: Array<OutgoingItem> = [];
}

export class MWRStorageClient extends MWRStorage {
    queue: Array<OutgoingItem> = [];
}

export class MWRStorageServer extends MWRStorage {
}