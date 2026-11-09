"use client";

import React, { useState } from "react";
import { Accordion, Button, Table } from "@heroui/react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { AstryxScope } from "../astryx.js";
import { Icon } from "../icons.js";
import { Mascot } from "../primitives.js";
import { LANDING_PLANS, LANDING_PLAN_COMPARISON } from "../landing/content.js";
import { PublicNav } from "../landing/public-nav.js";
import type { LandingPlan } from "../landing/landing-v2.js";

const callsToAction = { free: "Crear cuenta", pro: "Probar 7 días", elite: "Elegir Elite" };
const questions = [
  { id: "trial", question: "¿Cómo funciona la prueba de 7 días?", answer: "Tienes 7 días de Pro, una vez por persona. Si la prueba termina sin un plan activo, vuelves a Free y conservas tus datos." },
  { id: "tax", question: "¿El precio incluye IVA?", answer: "Sí. Los precios están en pesos mexicanos e incluyen IVA." },
  { id: "decisions", question: "¿PitchLab me dice a qué apostar?", answer: "PitchLab muestra lo más probable y su cuota justa. Tú decides si quieres apostar y cuánto." },
  { id: "wagers", question: "¿PitchLab acepta apuestas?", answer: "PitchLab es una herramienta de análisis deportivo. Las apuestas se hacen fuera de PitchLab." },
  { id: "invoice", question: "¿Puedo pedir CFDI?", answer: "[POR CONFIRMAR]" },
];

function PlanValue({ value }: { value: string | boolean }) {
  if (typeof value === "string") return value;
  return <span aria-label={value ? "Incluido" : "Sin acceso"}>{value ? "✓" : "—"}</span>;
}

function PlanComparison() {
  const [plan, setPlan] = useState("pro");
  const selected = LANDING_PLANS.find(({ id }) => id === plan) ?? LANDING_PLANS[1]!;
  return (
    <section aria-labelledby="pl-comparison-heading" className="pl-pricing-section">
      <h2 id="pl-comparison-heading">Compara los planes</h2>
      <Table className="pl-comparison-wide">
        <Table.Content aria-labelledby="pl-comparison-heading">
          <Table.Header>
            <Table.Column isRowHeader>Función</Table.Column>
            {LANDING_PLANS.map(({ id, name }) => (
              <Table.Column key={id} className={id === "pro" ? "pl-comparison-pro" : undefined}>{name}</Table.Column>
            ))}
          </Table.Header>
          <Table.Body>
            {LANDING_PLAN_COMPARISON.map(({ feature, plans }) => (
              <Table.Row key={feature}>
                <Table.Cell>{feature}</Table.Cell>
                {LANDING_PLANS.map(({ id }) => <Table.Cell key={id}><PlanValue value={plans[id]} /></Table.Cell>)}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table>
      <div className="pl-comparison-compact">
        <AstryxScope>
          <SegmentedControl label="Plan de la comparativa" value={plan} onChange={setPlan} size="lg" layout="fill">
            {LANDING_PLANS.map(({ id, name }) => <SegmentedControlItem key={id} value={id} label={name} />)}
          </SegmentedControl>
        </AstryxScope>
        <dl aria-label={`Funciones del plan ${selected.name}`}>
          {LANDING_PLAN_COMPARISON.map(({ feature, plans }) => (
            <div key={feature}><dt>{feature}</dt><dd><PlanValue value={plans[selected.id]} /></dd></div>
          ))}
        </dl>
      </div>
      <p className="pl-comparison-note">«—» indica una función fuera del plan. La cobertura puede ajustarse antes del lanzamiento.</p>
    </section>
  );
}

export interface PricingProps {
  loginHref: string;
  signupHref: string;
  onSelectPlan: (plan: LandingPlan["id"]) => void;
}

export function Pricing({ loginHref, signupHref, onSelectPlan }: PricingProps) {
  return (
    <div className="lv pl-pricing">
      <PublicNav onPricing loginHref={loginHref} signupHref={signupHref} />
      <main id="planes" className="pl-pricing-main">
        <section aria-labelledby="pl-pricing-heading" className="pl-pricing-hero">
          <div className="pl-pricing-intro">
            <p className="pl-account-eyebrow">Planes</p>
            <h1 id="pl-pricing-heading">Lo más probable de cada partido, al precio que elijas.</h1>
            <p>Precios en pesos mexicanos, IVA incluido. Empieza gratis o prueba Pro 7 días.</p>
          </div>
          <div className="pl-plan-grid">
            {LANDING_PLANS.map((plan) => (
              <article key={plan.id} className="pl-plan" data-plan={plan.id} aria-labelledby={`pl-plan-${plan.id}`}>
                {plan.id === "pro" && <span className="pl-plan-trial">7 días gratis</span>}
                <div><h2 id={`pl-plan-${plan.id}`}>{plan.name}</h2><p>{plan.blurb}</p></div>
                <p className="pl-plan-price">
                  {plan.price ? (
                    <><strong className="num"><span>$</span>{plan.price}</strong><small>MXN al mes</small></>
                  ) : <strong>Gratis</strong>}
                </p>
                <ul role="list">
                  {plan.features.map((feature) => <li key={feature}><Icon name="check" />{feature}</li>)}
                </ul>
                <Button variant={plan.id === "pro" ? "primary" : "secondary"} onPress={() => onSelectPlan(plan.id)}>
                  {callsToAction[plan.id]}
                </Button>
              </article>
            ))}
          </div>
        </section>
        <PlanComparison />
        <section className="pl-pricing-faq" aria-labelledby="pl-faq-heading">
          <div><h2 id="pl-faq-heading">Preguntas</h2><p>Lo que conviene saber antes de elegir.</p></div>
          <Accordion allowsMultipleExpanded={false} defaultExpandedKeys={["trial"]}>
            {questions.map(({ id, question, answer }) => (
              <Accordion.Item key={id} id={id}>
                <Accordion.Heading>
                  <Accordion.Trigger>{question}<Accordion.Indicator /></Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel><Accordion.Body>{answer}</Accordion.Body></Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </section>
        <section className="pl-pricing-close" aria-labelledby="pl-close-heading">
          <Mascot size={112} lazy />
          <div>
            <h2 id="pl-close-heading">Información para decidir.</h2>
            <p>Información para decidir, no una garantía. PitchLab no acepta apuestas. Solo mayores de 18.</p>
          </div>
          <Button onPress={() => onSelectPlan("pro")}>Probar Pro 7 días</Button>
        </section>
      </main>
    </div>
  );
}
