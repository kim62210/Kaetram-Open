import { isMobile } from '../utils/detect';

import type Game from '../game';
import type Entity from '../entity/entity';

/**
 * Mobile action button controller. Provides on-screen attack/pickup buttons
 * for touch devices so players don't need to tap individual entities.
 */

export default class MobileActions {
    private container: HTMLDivElement | null =
        document.querySelector<HTMLDivElement>('#mobile-action-buttons');
    private attackButton: HTMLButtonElement | null = document.querySelector<HTMLButtonElement>(
        '#mobile-action-attack'
    );
    private pickupButton: HTMLButtonElement | null = document.querySelector<HTMLButtonElement>(
        '#mobile-action-pickup'
    );

    public constructor(public game: Game) {
        if (!this.container || !this.attackButton || !this.pickupButton) return;

        this.attackButton.addEventListener('click', this.handleAttack.bind(this));
        this.pickupButton.addEventListener('click', this.handlePickup.bind(this));

        // Only display the buttons on mobile/tablet devices.
        if (isMobile()) this.show();
    }

    /**
     * Reveals the action buttons. Called automatically on mobile devices.
     */

    public show(): void {
        if (!this.container) return;
        this.container.hidden = false;
    }

    /**
     * Hides the action buttons.
     */

    public hide(): void {
        if (!this.container) return;
        this.container.hidden = true;
    }

    /**
     * Finds the closest attackable entity (mob, or pvp player) and routes the
     * request through the existing input.move() pipeline so all the standard
     * targeting/attack logic kicks in.
     */

    private handleAttack(): void {
        let target = this.findClosestEntity((entity) => this.isAttackable(entity));

        if (!target) return;

        this.game.input.move({
            x: target.x,
            y: target.y,
            gridX: target.gridX,
            gridY: target.gridY
        });
    }

    /**
     * Finds the closest dropped item and walks the player onto it. The server
     * will pick it up automatically once the player reaches the tile.
     */

    private handlePickup(): void {
        let target = this.findClosestEntity((entity) => entity.isItem());

        if (!target) return;

        this.game.input.move({
            x: target.x,
            y: target.y,
            gridX: target.gridX,
            gridY: target.gridY
        });
    }

    /**
     * Iterates through all loaded entities and returns the one with the
     * smallest grid distance from the player that satisfies the predicate.
     * @param predicate Filter callback for choosing eligible entities.
     */

    private findClosestEntity(predicate: (entity: Entity) => boolean): Entity | undefined {
        let { player } = this.game,
            closest: Entity | undefined,
            closestDistance = Number.POSITIVE_INFINITY;

        this.game.entities.forEachEntity((entity: Entity) => {
            if (entity.instance === player.instance) return;
            if (!predicate(entity)) return;

            let distance =
                Math.abs(entity.gridX - player.gridX) + Math.abs(entity.gridY - player.gridY);

            if (distance < closestDistance) {
                closest = entity;
                closestDistance = distance;
            }
        });

        return closest;
    }

    /**
     * Whether the given entity is something the player is allowed to attack:
     * always mobs, and players only when PvP is enabled in the current area.
     */

    private isAttackable(entity: Entity): boolean {
        if (entity.isMob()) return true;
        if (entity.isPlayer() && this.game.pvp) return true;

        return false;
    }
}
