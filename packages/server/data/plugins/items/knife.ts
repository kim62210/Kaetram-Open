import { Modules } from '@kaetram/common/network';

import type { Plugin } from '.';
import type Player from '@kaetram/server/src/game/entity/character/player/player';

export default class Knife implements Plugin {
    public onUse(player: Player): boolean {
        if (player.inCombat()) {
            player.notify(`전투 중에는 제작 메뉴를 열 수 없다.`);
            return false;
        }

        player.world.crafting.open(player, Modules.Skills.Fletching);

        return true;
    }
}
