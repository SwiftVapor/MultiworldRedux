
export class OutgoingItem {
    to: number;
    item: number;
    from: number;
    time: number;

    constructor(to: number, item: number, from: number) {
        this.to = to;
        this.item = item;
        this.from = from;
        this.time = Date.now();
    }
}
