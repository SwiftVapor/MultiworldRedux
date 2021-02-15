import { EventHandler, EventServerLeft, EventsServer } from "modloader64_api/EventHandler";
import { IModLoaderAPI, IPlugin } from "modloader64_api/IModLoaderAPI";
import { ModLoaderAPIInject } from "modloader64_api/ModLoaderAPIInjector";
import { INetworkPlayer, ServerNetworkHandler } from "modloader64_api/NetworkHandler";
import { ParentReference } from "modloader64_api/SidedProxy/SidedProxy";
import { MWR_GetExistingPlayersPacket, MWR_GetItemLog, MWR_GiveExistingPlayersPacket, MWR_ReceiptPacket, MWR_RegisterPlayerPacket, MWR_SendItemPacket } from "./Packets";
import { PlayerData } from "./PlayerData";
import { MWRStorageServer } from "./StorageBase";

export class Server {

    @ModLoaderAPIInject()
    ModLoader!: IModLoaderAPI;
    @ParentReference()
    parent!: IPlugin;

    @EventHandler(EventsServer.ON_LOBBY_CREATE)
    onLobbyCreated(lobby: string) {
        try {
            this.ModLoader.lobbyManager.createLobbyStorage(lobby, this.parent, new MWRStorageServer());
        }
        catch (err) {
            this.ModLoader.logger.error(err);
        }
    }

    @ServerNetworkHandler("MWR_RegisterPlayerPacket")
    onRegisterPlayer(packet: MWR_RegisterPlayerPacket) {
        let storage: MWRStorageServer = this.ModLoader.lobbyManager.getLobbyStorage(
            packet.lobby,
            this.parent
        ) as MWRStorageServer;
        if (storage === null) {
            return;
        }
        let player = packet.player.data.MWR.player as PlayerData;
        this.ModLoader.logger.info("Registering player: " + packet.player.nickname + " as " + player.name + " in world " + player.id.toString());
        if (!storage.players.has(player.id)) {
            storage.players.set(player.id, []);
            this.ModLoader.logger.debug("Creating new world: " + player.id);
        }
        storage.players.get(player.id)!.push(packet.player);
        for (let i = 0; i < packet.existingLog.length; i++) {
            let item1 = packet.existingLog[i];
            let exists = false;
            for (let j = 0; j < storage.itemLog.length; j++) {
                let item2 = storage.itemLog[j];
                if (item1.to === item2.to && item1.from === item2.from && item1.item === item2.item && item1.time === item2.time) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                storage.itemLog.push(item1);
            }
        }
    }

    @ServerNetworkHandler('MWR_GetExistingPlayersPacket')
    onNeedList(packet: MWR_GetExistingPlayersPacket) {
        let storage: MWRStorageServer = this.ModLoader.lobbyManager.getLobbyStorage(
            packet.lobby,
            this.parent
        ) as MWRStorageServer;
        if (storage === null) {
            return;
        }
        let response = new MWR_GiveExistingPlayersPacket(packet.lobby);
        storage.players.forEach((players: INetworkPlayer[], world: number) => {
            response.players[world] = players;
        });
        this.ModLoader.serverSide.sendPacketToSpecificPlayer(response, packet.player);
    }

    @ServerNetworkHandler('MWR_SendItemPacket')
    onItem(packet: MWR_SendItemPacket) {
        let storage: MWRStorageServer = this.ModLoader.lobbyManager.getLobbyStorage(
            packet.lobby,
            this.parent
        ) as MWRStorageServer;
        if (storage === null) {
            return;
        }
        storage.itemLog.push(packet.item);
        let world = packet.item.to;
        if (storage.players.has(world)) {
            let players = storage.players.get(world)!;
            for (let i = 0; i < players.length; i++) {
                let _packet = new MWR_SendItemPacket(packet.lobby, packet.item);
                this.ModLoader.serverSide.sendPacket(_packet);
            }
        }
    }

    @ServerNetworkHandler('MWR_ReceiptPacket')
    onReceipt(packet: MWR_ReceiptPacket) {
        let storage: MWRStorageServer = this.ModLoader.lobbyManager.getLobbyStorage(
            packet.lobby,
            this.parent
        ) as MWRStorageServer;
        if (storage === null) {
            return;
        }
        let world = packet.to;
        if (storage.players.has(world)) {
            let players = storage.players.get(world)!;
            for (let i = 0; i < players.length; i++) {
                this.ModLoader.serverSide.sendPacketToSpecificPlayer(new MWR_ReceiptPacket(packet.lobby, world, packet.receiver), players[i]);
            }
        }
    }

    @ServerNetworkHandler('MWR_GetItemLog')
    onLogGet(packet: MWR_GetItemLog) {
        let storage: MWRStorageServer = this.ModLoader.lobbyManager.getLobbyStorage(
            packet.lobby,
            this.parent
        ) as MWRStorageServer;
        if (storage === null) {
            return;
        }
        let _packet = new MWR_GetItemLog(packet.lobby);
        _packet.log = storage.itemLog;
        this.ModLoader.serverSide.sendPacketToSpecificPlayer(_packet, packet.player);
    }

    @EventHandler(EventsServer.ON_LOBBY_LEAVE)
    onPlayerLeft(evt: EventServerLeft) {
        let storage: MWRStorageServer = this.ModLoader.lobbyManager.getLobbyStorage(
            evt.lobby,
            this.parent
        ) as MWRStorageServer;
        if (storage === null) {
            return;
        }
        storage.players.forEach((players: INetworkPlayer[], world: number) => {
            let index = -1;
            for (let i = 0; i < players.length; i++) {
                if (players[i].uuid === evt.player.uuid) {
                    index = i;
                    break;
                }
            }
            if (index > -1) {
                this.ModLoader.logger.info("Removing player " + evt.player.nickname + " from world " + world.toString());
                storage.players.get(world)!.splice(index, 1);
            }
        });
    }

}