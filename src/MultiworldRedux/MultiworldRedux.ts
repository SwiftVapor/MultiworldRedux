import { IPlugin, IModLoaderAPI, IPluginServerConfig } from 'modloader64_api/IModLoaderAPI';
import { IOOTCore } from 'modloader64_api/OOT/OOTAPI';
import { InjectCore } from 'modloader64_api/CoreInjection';
import { Client } from './Client';
import { ProxySide, SidedProxy } from 'modloader64_api/SidedProxy/SidedProxy';
import { Server } from './Server';

class MultiworldRedux implements IPlugin, IPluginServerConfig {

    ModLoader!: IModLoaderAPI;
    pluginName?: string | undefined;
    @InjectCore()
    core!: IOOTCore;
    @SidedProxy(ProxySide.CLIENT, Client)
    client!: Client;
    @SidedProxy(ProxySide.SERVER, Server)
    server!: Server;

    preinit(): void {
    }
    init(): void {
    }
    postinit(): void {
    }
    onTick(frame?: number | undefined): void {
    }

    getServerURL(): string {
        return "192.99.70.23:8000";
    }

}

module.exports = MultiworldRedux;