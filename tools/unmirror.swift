// Mac: Mirror mode ko Extend me badalta hai
import CoreGraphics

var count: UInt32 = 0
CGGetOnlineDisplayList(0, nil, &count)
if count < 2 { exit(0) }
var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
CGGetOnlineDisplayList(count, &ids, &count)

var cfg: CGDisplayConfigRef?
CGBeginDisplayConfiguration(&cfg)
var changed = false
for id in ids where CGDisplayIsInMirrorSet(id) != 0 {
    CGConfigureDisplayMirrorOfDisplay(cfg, id, kCGNullDirectDisplay)
    changed = true
}
if changed { CGCompleteDisplayConfiguration(cfg, .permanently) } else { CGCancelDisplayConfiguration(cfg) }
