import fs from "fs";

fs.mkdirSync("research/linemate/evidence/browser-traces", { recursive: true });

const stepFiles = [
  { step: 58, name: "home_scenario_trace.json" },
  { step: 96, name: "home_screenshot_trace.json" },
  { step: 172, name: "trends_scenario_trace.json" },
  { step: 176, name: "props_scenario_trace.json" },
  { step: 220, name: "mobile_scenario_trace.json" },
  { step: 224, name: "pricing_scenario_trace.json" },
  { step: 228, name: "workstation_scenario_trace.json" }
];

for (const sf of stepFiles) {
  const p = `C:/Users/jairb/.gemini/antigravity/brain/654789f9-4ce5-4569-b2bf-bf4d00ca1a95/.system_generated/steps/${sf.step}/output.txt`;
  if (fs.existsSync(p)) {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    // Strip large base64 screenshot from trace to keep JSON readable while preserving metadata
    if (data.normalized_result?.steps) {
      for (const s of data.normalized_result.steps) {
        if (s.artifacts?.screenshot?.value?.data_base64) {
          s.artifacts.screenshot.value.data_base64 = `<base64_truncated_${s.artifacts.screenshot.value.bytes}_bytes>`;
        }
        if (s.artifacts?.dom?.value?.text) {
          s.artifacts.dom.value.text = `<dom_truncated_${s.artifacts.dom.value.bytes}_bytes>`;
        }
      }
    }
    fs.writeFileSync(`research/linemate/evidence/browser-traces/${sf.name}`, JSON.stringify(data, null, 2));
    console.log(`Saved trace: ${sf.name}`);
  }
}
