import { Modules } from '@kaetram/common/network';

import type { Plugin } from '.';
import type Player from '@kaetram/server/src/game/entity/character/player/player';

export default class HotSauce implements Plugin {
    public onUse(player: Player): boolean {
        if (player.status.has(Modules.Effects.HotSauce)) {
            player.notify(`이걸 여러 병 마시면 안 될 것 같다...`);
            return false;
        }

        player.notify(`강렬한 아드레날린이 솟구쳐 영원히 달릴 수 있을 것 같다.`);

        // Update the hot sauce effect.
        player.setRunning(false, true);

        setTimeout(() => {
            player.setRunning(false, false);
            player.notify('핫소스의 효과가 사라졌다.');
        }, 15_000);

        return true;
    }
}
