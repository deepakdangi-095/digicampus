import React from 'react';
import { Body, Card, H, Muted, Screen } from '../components/ui';

export default function AdminInfo() {
  return (
    <Screen>
      <Card style={{ gap: 8 }}>
        <H>Administrator console</H>
        <Body>Analytics, the approval engine, exam seating, compliance exports and gate monitoring are on the DigiCampus web console.</Body>
        <Muted>Use the Assistant tab for quick policy answers on the go.</Muted>
      </Card>
    </Screen>
  );
}
