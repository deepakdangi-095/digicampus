import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, ClipboardCheck, FileText, GraduationCap, Home, LogOut, MessageCircle, QrCode, ShieldCheck, Users } from 'lucide-react-native';
import { useAuth } from './auth';
import { Role } from './types';
import { C, F } from './theme';
import StudentHome from './screens/StudentHome';
import StudentRequests from './screens/StudentRequests';
import StudentLearn from './screens/StudentLearn';
import CampusPass from './screens/CampusPass';
import AIAssistant from './screens/AIAssistant';
import ParentPortal from './screens/ParentPortal';
import FacultyClasses from './screens/FacultyClasses';
import FacultyApprovals from './screens/FacultyApprovals';
import FacultyAtRisk from './screens/FacultyAtRisk';
import AdminInfo from './screens/AdminInfo';

interface Tab { key: string; label: string; Icon: LucideIcon; Screen: React.ComponentType }
const assistant: Tab = { key: 'ai', label: 'Assistant', Icon: MessageCircle, Screen: AIAssistant };

const TABS: Record<Role, Tab[]> = {
  STUDENT: [
    { key: 'home', label: 'Home', Icon: Home, Screen: StudentHome },
    { key: 'req', label: 'Requests', Icon: FileText, Screen: StudentRequests },
    { key: 'learn', label: 'Learn', Icon: GraduationCap, Screen: StudentLearn },
    { key: 'pass', label: 'Pass', Icon: QrCode, Screen: CampusPass },
    assistant,
  ],
  PARENT: [{ key: 'family', label: 'Family', Icon: Users, Screen: ParentPortal }, assistant],
  FACULTY: [
    { key: 'classes', label: 'Classes', Icon: Users, Screen: FacultyClasses },
    { key: 'appr', label: 'Approvals', Icon: ClipboardCheck, Screen: FacultyApprovals },
    { key: 'risk', label: 'At-risk', Icon: AlertTriangle, Screen: FacultyAtRisk },
    assistant,
  ],
  HOD: [
    { key: 'classes', label: 'Classes', Icon: Users, Screen: FacultyClasses },
    { key: 'appr', label: 'Approvals', Icon: ClipboardCheck, Screen: FacultyApprovals },
    { key: 'risk', label: 'At-risk', Icon: AlertTriangle, Screen: FacultyAtRisk },
    assistant,
  ],
  DEAN: [
    { key: 'appr', label: 'Approvals', Icon: ClipboardCheck, Screen: FacultyApprovals },
    { key: 'risk', label: 'At-risk', Icon: AlertTriangle, Screen: FacultyAtRisk },
    assistant,
  ],
  ADMIN: [{ key: 'admin', label: 'Console', Icon: ShieldCheck, Screen: AdminInfo }, assistant],
};

export default function Shell() {
  const { user, logout } = useAuth();
  const tabs = TABS[user!.role];
  const [active, setActive] = useState(tabs[0].key);
  const insets = useSafeAreaInsets();
  const Current = (tabs.find((t) => t.key === active) ?? tabs[0]).Screen;

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <StatusBar style="light" />
      <View style={{ backgroundColor: C.ink, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.display, fontSize: 17, color: '#fff' }} numberOfLines={1}>Hi, {user!.name.split(' (')[0].replace(/^(Dr|Prof)\.?\s+/, '').split(' ')[0]}</Text>
          <Text style={{ fontFamily: F.body, fontSize: 12, color: '#9FB0D8' }}>{user!.role}{user!.branch ? ` · ${user!.branch}` : ''}</Text>
        </View>
        <Pressable onPress={logout} accessibilityLabel="Sign out" hitSlop={12}><LogOut size={20} color="#9FB0D8" /></Pressable>
      </View>
      <View style={{ flex: 1 }}><Current /></View>
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#fff', borderTopWidth: 1, borderColor: C.line }}>
        <View style={{ flexDirection: 'row' }}>
          {tabs.map(({ key, label, Icon }) => {
            const on = key === active;
            return (
              <Pressable key={key} onPress={() => setActive(key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', gap: 2 }}>
                <Icon size={21} color={on ? C.ink : C.mute} />
                <Text style={{ fontFamily: on ? F.bodyBold : F.body, fontSize: 11, color: on ? C.ink : C.mute }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}
