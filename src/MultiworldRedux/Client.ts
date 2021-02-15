import { IModLoaderAPI, ModLoaderEvents } from 'modloader64_api/IModLoaderAPI';
import { onTick, Postinit } from 'modloader64_api/PluginLifecycle'
import { ModLoaderAPIInject } from 'modloader64_api/ModLoaderAPIInjector';
import { bus, EventHandler, EventsClient } from 'modloader64_api/EventHandler';
import { IOOTCore, LinkState, OotEvents } from 'modloader64_api/OOT/OOTAPI';
import { InjectCore } from 'modloader64_api/CoreInjection';
import { MWR_GetExistingPlayersPacket, MWR_GetItemLog, MWR_GiveExistingPlayersPacket, MWR_ReceiptPacket, MWR_RegisterPlayerPacket, MWR_SendItemPacket } from './Packets';
import { INetworkPlayer, NetworkHandler } from 'modloader64_api/NetworkHandler';
import { zeldaString } from 'modloader64_api/OOT/ZeldaString';
import { MWRStorageClient } from './StorageBase';
import { PlayerData } from './PlayerData';
import { OutgoingItem } from './OutgoingItem';
import { addToKillFeedQueue } from 'modloader64_api/Announcements';
import { StorageContainer } from 'modloader64_api/Storage';
import fs from 'fs';
import path from 'path';

export class Client {

    @ModLoaderAPIInject()
    ModLoader!: IModLoaderAPI;
    private rando_context_pointer: number = 0x801C8464;
    private coop_context: number = 0;
    private protocol_version_addr = this.coop_context + 0
    private player_id_addr = this.coop_context + 4
    private player_name_id_addr = this.coop_context + 5
    private incoming_player_addr = this.coop_context + 6
    private incoming_item_addr = this.coop_context + 8
    private outgoing_key_addr = this.coop_context + 12
    private outgoing_item_addr = this.coop_context + 16
    private outgoing_player_addr = this.coop_context + 18
    private player_names_addr = this.coop_context + 20
    private internalCountAddr = 0x11A5D0 + 0x90;
    private disableSelf: boolean = true;
    private clientStorage: MWRStorageClient = new MWRStorageClient();
    private key: string = "";

    @InjectCore()
    core!: IOOTCore;

    @onTick()
    onTick() {

        if (this.disableSelf) return;
        if (this.core.helper.isTitleScreen()) return;
        if (!this.core.helper.isSceneNumberValid()) return;
        if (this.core.link.state !== LinkState.STANDING) return;
        if (this.core.helper.isLinkEnteringLoadingZone()) return;
        if (!this.core.helper.isInterfaceShown()) return;

        if (this.hasOutgoingItem()) {
            // We have an item. Send it.
            let item = this.getOutgoingItem(true);
            this.clientStorage.itemLog.push(item);
            let sc = new StorageContainer(this.key);
            sc.storeObject(this.clientStorage.itemLog);
            this.ModLoader.clientSide.sendPacket(new MWR_SendItemPacket(this.ModLoader.clientLobby, item));
        }

        if (this.clientStorage.queue.length > 0 && !this.hasIncomingItem()) {
            let item = this.clientStorage.queue.shift();
            this.setIncomingItem(item!.item, item!.to);
        }
    }

    @Postinit()
    postinit() {
        this.ModLoader.utils.setTimeoutFrames(() => {
            if (this.ModLoader.emulator.rdramRead32(this.rando_context_pointer) === 0) {
                this.ModLoader.logger.error("This is not an OotR Multiworld rom!");
                this.disableSelf = true;
                return;
            } else {
                this.ModLoader.logger.info("Valid multiworld context detected. Good to go.");
                this.coop_context = this.ModLoader.emulator.rdramReadPtr32(this.rando_context_pointer, 0x0);
                this.ModLoader.emulator.rdramWrite32(this.outgoing_key_addr, 0);
                this.ModLoader.emulator.rdramWrite16(this.outgoing_item_addr, 0);
                this.ModLoader.emulator.rdramWrite16(this.outgoing_player_addr, 0);
                this.disableSelf = false;
                this.ModLoader.clientSide.sendPacket(new MWR_GetExistingPlayersPacket(this.ModLoader.clientLobby));
            }
            if (this.ModLoader.isModLoaded("OotOnline")) {
                this.ModLoader.logger.info("Ocarina of Time Online detected.");
                this.ModLoader.logger.info("Requesting OotO shut its syncing systems down...");
                bus.emit('OotOnline:EnableGhostMode', {});
            }
        }, 20);
    }

    @EventHandler(ModLoaderEvents.ON_ROM_PATCHED_PRE)
    onPrePatch(evt: any) {
        let rom: Buffer = evt.rom;
        let hash: string = this.ModLoader.utils.hashBuffer(rom);
        this.key = hash;
    }

    @EventHandler(OotEvents.ON_SAVE_LOADED)
    onSaveLoaded() {
        if (this.disableSelf) return;
        this.ModLoader.utils.setTimeoutFrames(() => {
            this.ModLoader.emulator.rdramWrite32(this.outgoing_key_addr, 0);
            this.ModLoader.emulator.rdramWrite16(this.outgoing_item_addr, 0);
            this.ModLoader.emulator.rdramWrite16(this.outgoing_player_addr, 0);
            this.protocol_version_addr = this.coop_context + 0
            this.player_id_addr = this.coop_context + 4
            this.player_name_id_addr = this.coop_context + 5
            this.incoming_player_addr = this.coop_context + 6
            this.incoming_item_addr = this.coop_context + 8
            this.outgoing_key_addr = this.coop_context + 12
            this.outgoing_item_addr = this.coop_context + 16
            this.outgoing_player_addr = this.coop_context + 18
            this.player_names_addr = this.coop_context + 20
            this.ModLoader.logger.debug("Multiworld Redux starting up...");
            this.ModLoader.logger.debug("Multiworld protocol version: " + this.ModLoader.emulator.rdramRead32(this.protocol_version_addr));
            this.ModLoader.logger.debug("Player ID: " + this.ModLoader.emulator.rdramRead8(this.player_id_addr));
            this.ModLoader.logger.debug("Player name: " + this.core.save.player_name.trim());
            this.ModLoader.logger.debug("Rando Context: " + this.coop_context.toString(16));
            this.ModLoader.logger.debug(this.player_names_addr.toString(16));
            // Attach Multiworld identification data straight to the player object.
            this.ModLoader.me.data["MWR"] = {};
            this.ModLoader.me.data.MWR["player"] = new PlayerData(this.ModLoader.emulator.rdramRead8(this.player_id_addr), this.core.save.player_name.trim());
            let me = this.ModLoader.me.data.MWR.player as PlayerData;
            if (!this.clientStorage.players.has(me.id)) {
                this.clientStorage.players.set(me.id, []);
                this.ModLoader.logger.debug("Creating new world: " + me.id);
            }
            this.setPlayerName(me.id, this.core.save.player_name.trim());
            if (fs.existsSync(path.resolve(".", "storage", this.key + ".pak"))) {
                let sc = new StorageContainer(this.key);
                this.clientStorage.itemLog = sc.loadObject();
                this.ModLoader.logger.debug("Loading existing item data for this seed.");
            }
            this.ModLoader.clientSide.sendPacket(new MWR_RegisterPlayerPacket(this.ModLoader.clientLobby, this.clientStorage.itemLog));
            this.ModLoader.clientSide.sendPacket(new MWR_GetItemLog(this.ModLoader.clientLobby));
        }, 20);
    }

    getInternalCount(): number {
        return this.ModLoader.emulator.rdramRead8(this.internalCountAddr);
    }

    setInternalCount(count: number): void {
        this.ModLoader.emulator.rdramWrite8(this.internalCountAddr, count);
    }

    setPlayerName(playerNumber: number, playerName: string): void {
        playerName = playerName.substr(0, 8).padEnd(8, " ");
        var offset = this.player_names_addr + (8 * playerNumber);
        this.ModLoader.emulator.rdramWriteBuffer(offset, zeldaString.encode(playerName));
    }

    getPlayerName(playerNumber: number): string {
        var offset: number = this.player_names_addr + (8 * playerNumber);
        var playerName = this.ModLoader.emulator.rdramReadBuffer(offset, 8);
        return zeldaString.decode(playerName).trim();
    }

    hasOutgoingItem(): boolean {
        return this.ModLoader.emulator.rdramRead32(this.outgoing_item_addr) !== 0;
    }

    getOutgoingItem(clear: boolean): OutgoingItem {
        let itemId: number = this.ModLoader.emulator.rdramRead16(this.outgoing_item_addr);
        let receivingPlayer: number = this.ModLoader.emulator.rdramRead16(this.outgoing_player_addr);

        if (clear) {
            this.ModLoader.emulator.rdramWrite32(this.outgoing_key_addr, 0);
            this.ModLoader.emulator.rdramWrite16(this.outgoing_item_addr, 0);
            this.ModLoader.emulator.rdramWrite16(this.outgoing_player_addr, 0);
        }
        let player = this.ModLoader.me.data.MWR.player as PlayerData;
        return new OutgoingItem(receivingPlayer, itemId, player.id);
    }

    setOutgoingItem(id: number, reciever: INetworkPlayer): void {
        let r = reciever.data.MWR.player as PlayerData;
        this.ModLoader.emulator.rdramWrite32(this.outgoing_key_addr, 1);
        this.ModLoader.emulator.rdramWrite16(this.outgoing_item_addr, id);
        this.ModLoader.emulator.rdramWrite16(this.outgoing_player_addr, r.id);
    }

    hasIncomingItem(): boolean {
        return (this.ModLoader.emulator.rdramRead16(this.incoming_item_addr) !== 0);
    }

    getIncomingItem(): number {
        return this.ModLoader.emulator.rdramRead16(this.incoming_item_addr);
    }

    setIncomingItem(id: number, receiver: number): void {
        this.ModLoader.emulator.rdramWrite16(this.incoming_item_addr, id);
        this.ModLoader.emulator.rdramWrite16(this.incoming_player_addr, receiver);
    }

    // Networking.
    @NetworkHandler('MWR_RegisterPlayerPacket')
    onRegisterPlayer(packet: MWR_RegisterPlayerPacket) {
        let player = packet.player.data.MWR.player as PlayerData;
        this.ModLoader.logger.info("Registering player: " + packet.player.nickname + " as " + player.name + " in world " + player.id.toString());
        if (!this.clientStorage.players.has(player.id)) {
            this.clientStorage.players.set(player.id, []);
            this.ModLoader.logger.debug("Creating new world: " + player.id);
        }
        this.clientStorage.players.get(player.id)!.push(packet.player);
        this.setPlayerName(player.id, player.name);
    }

    @NetworkHandler('MWR_GiveExistingPlayersPacket')
    onLogin(packet: MWR_GiveExistingPlayersPacket) {
        Object.keys(packet.players).forEach((key: string) => {
            let world = parseInt(key);
            let players = packet.players[key];
            if (!this.clientStorage.players.has(world)) {
                this.clientStorage.players.set(world, []);
                this.ModLoader.logger.debug("Creating new world: " + world);
            }
            for (let i = 0; i < players.length; i++) {
                this.clientStorage.players.get(world)!.push(players[i]);
                this.setPlayerName(world, players[i].data.MWR.player.name);
            }
        });
    }

    @NetworkHandler('MWR_SendItemPacket')
    onItem(packet: MWR_SendItemPacket) {
        let player = this.ModLoader.me.data.MWR.player as PlayerData;
        if (packet.item.to === player.id) {
            this.clientStorage.itemLog.push(packet.item);
            let sc = new StorageContainer(this.key);
            sc.storeObject(this.clientStorage.itemLog);
            this.clientStorage.queue.push(packet.item);
            this.ModLoader.clientSide.sendPacket(new MWR_ReceiptPacket(this.ModLoader.clientLobby, packet.item.from, player.id));
        }
    }

    @NetworkHandler('MWR_ReceiptPacket')
    onReceipt(packet: MWR_ReceiptPacket) {
        let player = this.ModLoader.me.data.MWR.player as PlayerData;
        if (packet.receiver === player.id) return;
        addToKillFeedQueue("World " + packet.receiver.toString() + " got an item from your world.");
    }

    @NetworkHandler('MWR_GetItemLog')
    onLog(packet: MWR_GetItemLog) {
        let player = this.ModLoader.me.data.MWR.player as PlayerData;
        for (let i = 0; i < packet.log.length; i++) {
            let item1 = packet.log[i];
            let exists = false;
            for (let j = 0; j < this.clientStorage.itemLog.length; j++) {
                let item2 = this.clientStorage.itemLog[j];
                if (item1.to === item2.to && item1.from === item2.from && item1.item === item2.item && item1.time === item2.time) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                this.clientStorage.itemLog.push(item1);
                if (item1.to === player.id) {
                    this.clientStorage.queue.push(item1);
                }
            }
        }
        let sc = new StorageContainer(this.key);
        sc.storeObject(this.clientStorage.itemLog);
    }

    @EventHandler(EventsClient.ON_PLAYER_LEAVE)
    onPlayerLeft(player: INetworkPlayer) {
        this.clientStorage.players.forEach((players: INetworkPlayer[], world: number) => {
            let index = -1;
            for (let i = 0; i < players.length; i++) {
                if (players[i].uuid === player.uuid) {
                    index = i;
                    break;
                }
            }
            if (index > -1) {
                this.ModLoader.logger.info("Removing player " + player.nickname + " from world " + world.toString());
                this.clientStorage.players.get(world)!.splice(index, 1);
            }
        });
    }

}