import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';
import { OutgoingItem } from './OutgoingItem';
import { PlayerData } from './PlayerData';

export class MWR_RegisterPlayerPacket extends Packet {
    
    existingLog: Array<OutgoingItem> = [];

    constructor(lobby: string, log: Array<OutgoingItem>) {
        super('MWR_RegisterPlayerPacket', 'MultiworldRedux', lobby, true);
        this.existingLog = log;
    }
}

export class MWR_GetExistingPlayersPacket extends Packet {
    constructor(lobby: string) {
        super('MWR_GetExistingPlayersPacket', 'MultiworldRedux', lobby, false);
    }
}

export class MWR_GiveExistingPlayersPacket extends Packet {

    // Have to change the map to an object in order to send properly.
    players: any = {};

    constructor(lobby: string) {
        super('MWR_GiveExistingPlayersPacket', 'MultiworldRedux', lobby, true);
    }
}

export class MWR_SendItemPacket extends Packet {
    item: OutgoingItem;

    constructor(lobby: string, item: OutgoingItem) {
        super('MWR_SendItemPacket', 'MultiworldRedux', lobby, false);
        this.item = item;
    }
}

export class MWR_ReceiptPacket extends Packet {

    receiver: number;
    to: number;

    constructor(lobby: string, to: number, me: number) {
        super('MWR_ReceiptPacket', 'MultiworldRedux', lobby, false);
        this.to = to;
        this.receiver = me;
    }
}

export class MWR_GetItemLog extends Packet {

    log: Array<OutgoingItem> = [];

    constructor(lobby: string) {
        super('MWR_GetItemLog', 'MultiworldRedux', lobby, true);
    }
}