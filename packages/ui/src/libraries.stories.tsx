import React from "react";
import {
  Button as HeroButton,
  Card,
  Chip,
  Input,
  Label,
  Switch,
  Tabs,
  TextField,
} from "@heroui/react";
import { Button as AstryxButton } from "@astryxdesign/core/Button";
import { Badge as AstryxBadge } from "@astryxdesign/core/Badge";
import { Card as AstryxCard } from "@astryxdesign/core/Card";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Button } from "./components/ui/button.js";
import { Tag, Panel } from "./primitives.js";
import { AstryxScope } from "./astryx.js";

/**
 * Convivencia de librerías: HeroUI v3 (gratis), shadcn/ui y Astryx leen los mismos tokens
 * de PitchLab, así que un botón primario es Pulso venga de donde venga.
 * Reglas: docs/design/UI_LIBRARIES.md.
 */
export default {
  title: "PitchLab/Librerías · HeroUI + shadcn + Astryx",
  id: "pitchlab-librerias",
  parameters: { layout: "padded" },
};

const stack: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-6)",
  maxWidth: 880,
  fontFamily: "var(--font-family)",
  color: "var(--text-primary)",
};
const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--space-3)",
};
const eyebrow: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--type-caption, 0.75rem)",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gap: "var(--space-3)" }}>
      <p style={eyebrow}>{title}</p>
      {children}
    </section>
  );
}

function LigaSegmentada() {
  const [liga, setLiga] = React.useState("liga-mx");
  return (
    <SegmentedControl label="Liga" value={liga} onChange={setLiga}>
      <SegmentedControlItem value="liga-mx" label="Liga MX" />
      <SegmentedControlItem value="premier" label="Premier" />
      <SegmentedControlItem value="nfl" label="NFL" />
    </SegmentedControl>
  );
}

export const LadoALado = () => (
  <div style={stack}>
    <Section title="Botones · HeroUI">
      <div style={row}>
        <HeroButton variant="primary">Ver análisis</HeroButton>
        <HeroButton variant="secondary">Comparar cuota</HeroButton>
        <HeroButton variant="tertiary">Más mercados</HeroButton>
        <HeroButton variant="ghost">Cancelar</HeroButton>
        <HeroButton variant="danger">Eliminar pick</HeroButton>
        <HeroButton variant="primary" isDisabled>
          Sin datos
        </HeroButton>
      </div>
    </Section>

    <Section title="Botones · shadcn">
      <div style={row}>
        <Button>Ver análisis</Button>
        <Button variant="secondary">Comparar cuota</Button>
        <Button variant="outline">Más mercados</Button>
        <Button variant="ghost">Cancelar</Button>
        <Button variant="destructive">Eliminar pick</Button>
      </div>
    </Section>

    <Section title="Botones · Astryx">
      <AstryxScope>
        <div style={row}>
          <AstryxButton variant="primary" label="Ver análisis" />
          <AstryxButton variant="secondary" label="Comparar cuota" />
          <AstryxButton variant="ghost" label="Cancelar" />
          <AstryxButton variant="destructive" label="Eliminar pick" />
        </div>
      </AstryxScope>
    </Section>

    <Section title="Selector segmentado y estados · Astryx">
      <AstryxScope>
        <div style={row}>
          <LigaSegmentada />
          <AstryxBadge variant="success" label="Datos frescos" />
          <AstryxBadge variant="warning" label="Muestra corta" />
          <AstryxBadge variant="purple" label="Liga MX" />
        </div>
      </AstryxScope>
    </Section>

    <Section title="Chips · HeroUI  ·  Tag · PitchLab">
      <div style={row}>
        <Chip color="accent" variant="soft">Favorito</Chip>
        <Chip color="success" variant="soft">Datos frescos</Chip>
        <Chip color="warning" variant="soft">Muestra corta</Chip>
        <Chip color="danger" variant="soft">Sin cuota</Chip>
        <Tag variant="model">Modelo PitchLab · en validación</Tag>
      </div>
    </Section>

    <Section title="Formulario y controles · HeroUI">
      <div style={{ ...row, alignItems: "flex-end" }}>
        <TextField name="cuota" style={{ minWidth: 240 }}>
          <Label>Tu cuota</Label>
          <Input placeholder="2.10" inputMode="decimal" />
        </TextField>
        <Switch defaultSelected>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>Mostrar cuota justa</Switch.Content>
        </Switch>
      </div>
    </Section>

    <Section title="Pestañas · HeroUI">
      <Tabs defaultSelectedKey="mercados">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Secciones del partido">
            <Tabs.Tab id="mercados">
              Mercados
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="forma">
              Forma
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="tabla">
              Tabla
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="mercados">1X2, doble oportunidad y totales.</Tabs.Panel>
        <Tabs.Panel id="forma">Últimos cinco partidos de cada equipo.</Tabs.Panel>
        <Tabs.Panel id="tabla">Posiciones con los partidos ya jugados.</Tabs.Panel>
      </Tabs>
    </Section>

    <Section title="Superficies · HeroUI Card  ·  Panel · PitchLab">
      <div style={{ display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Card>
          <Card.Header>
            <Card.Title>América vs. Cruz Azul</Card.Title>
            <Card.Description>Jornada 17 · sábado 19:05</Card.Description>
          </Card.Header>
          <Card.Content>
            <span className="num">Local 46.2 %</span>
          </Card.Content>
          <Card.Footer>
            <HeroButton variant="primary" size="sm">
              Ver análisis
            </HeroButton>
          </Card.Footer>
        </Card>
        <AstryxScope>
          <AstryxCard>
            <p style={{ margin: 0, fontWeight: 600 }}>América vs. Cruz Azul</p>
            <p style={{ margin: "var(--space-1) 0 var(--space-3)", color: "var(--text-secondary)" }}>
              Jornada 17 · sábado 19:05 · Astryx Card
            </p>
            <span className="num">Local 46.2 %</span>
          </AstryxCard>
        </AstryxScope>
        <Panel>
          <p style={{ margin: 0, fontWeight: 600 }}>América vs. Cruz Azul</p>
          <p style={{ margin: "var(--space-1) 0 var(--space-3)", color: "var(--text-secondary)" }}>
            Jornada 17 · sábado 19:05
          </p>
          <span className="num">Local 46.2 %</span>
        </Panel>
      </div>
    </Section>
  </div>
);
LadoALado.storyName = "Lado a lado";
