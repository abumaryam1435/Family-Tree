import React, { useState } from 'react';
import { useFamilyData } from './hooks/useFamilyData';
import { Navbar } from './components/Navbar';
import { HomeHero } from './components/HomeHero';
import { TreeView } from './components/TreeView';
import { LineageView } from './components/LineageView';
import { KinshipFinderView } from './components/KinshipFinderView';
import { MembersList } from './components/MembersList';
import { IndependentTrees } from './components/IndependentTrees';
import { PersonModal } from './components/PersonModal';
import { AddPersonModal } from './components/AddPersonModal';
import { AddFatherModal } from './components/AddFatherModal';
import { MergeTreesModal } from './components/MergeTreesModal';
import { AdminModal } from './components/AdminModal';
import { ChangeRequestModal } from './components/ChangeRequestModal';
import { PrintView } from './components/PrintView';
import { OfflineBanner } from './components/OfflineBanner';
import { ConfirmModal } from './components/ConfirmModal';
import { apiClient } from './api/client';
import { Person, Gender } from './types/family';
import { TreeDeciduous, CheckCircle, AlertCircle } from 'lucide-react';

export default function App() {
  const {
    persons,
    treeRoots,
    settings,
    isAdmin,
    loading,
    error,
    toastMessage,
    activeTab,
    selectedPersonId,
    selectedTreeRootId,
    searchQuery,
    searchResults,
    stats,
    setActiveTab,
    setSelectedPersonId,
    setSelectedTreeRootId,
    setSearchQuery,
    showToast,
    fetchData,
    getPerson,
    getChildren,
    getSons,
    getDaughters,
    getAncestors,
    getLineageString,
    getDescendantsCount
  } = useFamilyData();

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [initialFatherIdForAdd, setInitialFatherIdForAdd] = useState<string | null>(null);

  const [isAddFatherModalOpen, setIsAddFatherModalOpen] = useState(false);
  const [targetPersonForAddFather, setTargetPersonForAddFather] = useState<Person | null>(null);

  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSourcePersonId, setMergeSourcePersonId] = useState<string | null>(null);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  const handleOpenMergeModal = (sourcePersonId?: string | null) => {
    setMergeSourcePersonId(sourcePersonId || null);
    setIsMergeModalOpen(true);
  };
  
  const [changeRequestTarget, setChangeRequestTarget] = useState<Person | null>(null);
  const [printPersonId, setPrintPersonId] = useState<string | null>(null);
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [personHistory, setPersonHistory] = useState<string[]>([]);

  // Selected person object for PersonModal
  const inspectedPerson = selectedPersonId ? getPerson(selectedPersonId) || null : null;
  const previousPersonId = personHistory.length > 0 ? personHistory[personHistory.length - 1] : null;
  const previousPerson = previousPersonId ? getPerson(previousPersonId) || null : null;

  // Handlers for Add Person (Restricted to Admin)
  const handleOpenAdd = (fatherId?: string | null) => {
    if (!isAdmin) return;
    setInitialFatherIdForAdd(fatherId || null);
    setEditingPerson(null);
    setIsAddModalOpen(true);
  };

  const handleCreatePerson = async (data: any) => {
    if (!isAdmin) return;
    try {
      const newPerson = await apiClient.addPerson(data);
      showToast(`تمت إضافة ${newPerson.fullName} بنجاح إلى شجرة العائلة`);
      await fetchData(true);
      // Keep the previous PersonModal or current tab active; only open the new person if added from home with no modal open
      if (!selectedPersonId && activeTab === 'home') {
        setSelectedPersonId(newPerson.id);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleQuickAddChild = async (data: { fullName: string; gender: Gender; fatherId: string }) => {
    if (!isAdmin) return;
    try {
      const newPerson = await apiClient.addPerson(data);
      showToast(`تمت إضافة (${newPerson.fullName}) بنجاح`);
      await fetchData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleUpdatePerson = async (id: string, updates: any) => {
    if (!isAdmin) return;
    try {
      const updated = await apiClient.updatePerson(id, updates);
      showToast(`تم تحديث بيانات ${updated.fullName} بنجاح`);
      await fetchData(true);
      setEditingPerson(null);
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleToggleGender = async (id: string) => {
    if (!isAdmin) return;
    const person = getPerson(id);
    if (!person) return;
    const newGender: Gender = person.gender === 'male' ? 'female' : 'male';
    try {
      await apiClient.updatePerson(id, { gender: newGender });
      showToast(`تم تعديل جنس (${person.fullName}) إلى ${newGender === 'male' ? 'ذكر' : 'أنثى'}`);
      await fetchData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const requestDeletePerson = (id: string) => {
    if (!isAdmin) return;
    const person = getPerson(id);
    if (!person) return;
    setPersonToDelete(person);
  };

  const confirmDeletePerson = async () => {
    if (!personToDelete || !isAdmin) return;
    const target = personToDelete;
    setPersonToDelete(null);

    try {
      await apiClient.deletePerson(target.id);
      showToast(`تم حذف (${target.fullName}) بنجاح`);
      if (selectedPersonId === target.id) setSelectedPersonId(null);
      await fetchData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handlers for Add Father / Root Ancestor Above
  const handleOpenAddFather = (personId: string) => {
    if (!isAdmin) return;
    const p = getPerson(personId);
    if (!p) return;
    setTargetPersonForAddFather(p);
    setIsAddFatherModalOpen(true);
  };

  const handleExecuteAddFather = async (personId: string, fatherData: any) => {
    if (!isAdmin) return;
    try {
      const childBefore = getPerson(personId);
      const wasRoot = !childBefore?.fatherId;
      const res = await apiClient.addFatherAbove(personId, fatherData);
      const topAncestor = res.highestAncestor || res.father;
      showToast(
        `تم نقل/ربط (${res.child.fullName}) وفروعه (${res.updatedDescendantsCount || 0} فرع) بالجد الأعلى (${topAncestor.fullName}) وتحديث التسلسل والعلاقات تلقائياً.`
      );
      await fetchData(true);
      // If the child was the currently selected tree root, promote the highest ancestor (or its root) as the selected tree root
      if (wasRoot && (!selectedTreeRootId || selectedTreeRootId === personId)) {
        let rootId = topAncestor.id;
        let cur: Person | undefined = topAncestor;
        const visited = new Set<string>();
        while (cur?.fatherId && !visited.has(cur.id)) {
          visited.add(cur.id);
          const parent = getPerson(cur.fatherId);
          if (parent) {
            rootId = parent.id;
            cur = parent;
          } else {
            break;
          }
        }
        setSelectedTreeRootId(rootId);
      }
      return res;
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  // Handlers for Merge Trees
  const handleExecuteMerge = async (sourceId: string, targetId: string) => {
    if (!isAdmin) throw new Error('هذه الصلاحية للمشرف فقط');
    try {
      const res = await apiClient.mergeTrees(sourceId, targetId);
      showToast(`تم دمج الشجرتين بنجاح ونقل ${res.movedCount} فروع`);
      await fetchData(true);
      if (selectedTreeRootId === sourceId) {
        setSelectedTreeRootId(targetId);
      }
      return res;
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleLogoutAdmin = async () => {
    try {
      await apiClient.logoutAdmin();
      setIsAdminModalOpen(false);
      setActiveTab('home');
      setSelectedPersonId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('تم تسجيل الخروج من وضع المشرف والعودة للصفحة الرئيسية');
      await fetchData(true);
      setActiveTab('home');
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ أثناء تسجيل الخروج', 'error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-slate-900 font-sans selection:bg-[#0F4C3A]/15 selection:text-[#0F4C3A]">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddModal={() => handleOpenAdd(null)}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onLogout={handleLogoutAdmin}
        editingEnabled={isAdmin}
        isAdmin={isAdmin}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`fixed top-16 sm:top-20 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-lg z-50 flex items-start sm:items-center gap-2 px-4 sm:px-5 py-3 rounded-2xl shadow-xl text-xs font-bold transition-all duration-300 ${
            toastMessage.type === 'success'
              ? 'bg-[#0F4C3A] text-white border border-[#D4AF37]/40'
              : 'bg-red-600 text-white border border-red-500'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-white shrink-0 mt-0.5 sm:mt-0" />
          )}
          <span className="leading-snug break-words">{toastMessage.text}</span>
        </div>
      )}

      {/* Main Container */}
      <main className={`flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 ${printPersonId ? 'no-print' : ''}`}>
        {loading && persons.length === 0 ? (
          <div className="py-32 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center mx-auto animate-spin">
              <TreeDeciduous className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-700">جارٍ تحميل بيانات شجرة العائلة والأنساب...</p>
          </div>
        ) : error && persons.length === 0 ? (
          <div className="py-24 text-center space-y-3 bg-red-50 p-6 rounded-3xl border border-red-200">
            <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
            <h3 className="text-base font-bold text-red-900">تعذر الاتصال بالخادم</h3>
            <p className="text-xs text-red-700">{error}</p>
            <button
              onClick={() => fetchData()}
              className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <>
            {/* View 1: Home Dashboard */}
            {activeTab === 'home' && (
              <HomeHero
                stats={stats}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchResults={searchResults}
                treeRoots={treeRoots}
                onSelectPerson={(id) => setSelectedPersonId(id)}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onOpenAddModal={() => handleOpenAdd(null)}
                onOpenMergeModal={() => setIsMergeModalOpen(true)}
                onOpenAdminModal={() => setIsAdminModalOpen(true)}
                onOpenAddFather={(rootId) => handleOpenAddFather(rootId)}
                editingEnabled={isAdmin}
                isAdmin={isAdmin}
                getPerson={getPerson}
                getLineageString={getLineageString}
              />
            )}

            {/* View 2: Interactive Tree Visualizer */}
            {activeTab === 'tree' && (
              <TreeView
                persons={persons}
                treeRoots={treeRoots}
                selectedTreeRootId={selectedTreeRootId}
                setSelectedTreeRootId={setSelectedTreeRootId}
                onSelectPerson={(id) => setSelectedPersonId(id)}
                onOpenAddModalWithFather={(fatherId) => handleOpenAdd(fatherId)}
                onOpenAddFather={(personId) => handleOpenAddFather(personId)}
                onOpenMergeModal={(id) => handleOpenMergeModal(id)}
                onExecuteMerge={handleExecuteMerge}
                onOpenEditPerson={(p) => {
                  if (!isAdmin) return;
                  setEditingPerson(p);
                  setIsAddModalOpen(true);
                }}
                onDeletePerson={requestDeletePerson}
                onToggleGender={handleToggleGender}
                editingEnabled={isAdmin}
                isAdmin={isAdmin}
                getPerson={getPerson}
                getChildren={getChildren}
                getAncestors={getAncestors}
                getLineageString={getLineageString}
              />
            )}

            {/* View 3: Lineage Path View */}
            {activeTab === 'lineage' && (
              <LineageView
                persons={persons}
                selectedPersonId={selectedPersonId}
                onSelectPerson={(id) => setSelectedPersonId(id)}
                getPerson={getPerson}
                getChildren={getChildren}
                getAncestors={getAncestors}
                getLineageString={getLineageString}
                onPrintPerson={(id) => setPrintPersonId(id)}
              />
            )}

            {/* View 3.5: Kinship Finder Between Two Persons */}
            {activeTab === 'kinship' && (
              <KinshipFinderView
                persons={persons}
                initialPersonAId={selectedPersonId}
                onSelectPerson={(id) => setSelectedPersonId(id)}
              />
            )}

            {/* View 4: Members List */}
            {activeTab === 'list' && (
              <MembersList
                persons={persons}
                onSelectPerson={(id) => setSelectedPersonId(id)}
                onOpenAddModal={() => handleOpenAdd(null)}
                onOpenEditModal={(p) => {
                  if (!isAdmin) return;
                  setEditingPerson(p);
                  setIsAddModalOpen(true);
                }}
                onOpenAddFather={(personId) => handleOpenAddFather(personId)}
                onDeletePerson={requestDeletePerson}
                onToggleGender={handleToggleGender}
                onPrintPerson={(id) => setPrintPersonId(id)}
                editingEnabled={isAdmin}
                isAdmin={isAdmin}
                getPerson={getPerson}
                getChildren={getChildren}
                getAncestors={getAncestors}
              />
            )}

            {/* View 5: Independent Trees Gallery */}
            {activeTab === 'trees' && (
              <IndependentTrees
                treeRoots={treeRoots}
                onSelectTree={(rootId) => {
                  setSelectedTreeRootId(rootId);
                  setActiveTab('tree');
                }}
                onOpenMergeModal={() => setIsMergeModalOpen(true)}
                onOpenAddModal={() => handleOpenAdd(null)}
                onOpenAddFather={(rootId) => handleOpenAddFather(rootId)}
                editingEnabled={isAdmin}
                isAdmin={isAdmin}
                getDescendantsCount={getDescendantsCount}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="no-print mt-auto border-t border-slate-200/80 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-[#0F4C3A]">
            <TreeDeciduous className="w-4 h-4 text-[#D4AF37]" />
            <span>شجرة العائلة — حفظ الأنساب وتوارث الأجيال</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400 text-[11px]">
            <span>التخزين دائم ومشترك</span>
            <span>·</span>
            <span>جميع الحقوق محفوظة للعائلة</span>
          </div>
        </div>
      </footer>

      {/* Modals & Dialogs */}
      
      {/* 1. Person Details Card Modal (stays active in state while sub-modals open so saving edits returns directly here) */}
      {inspectedPerson && !isAddModalOpen && !isAddFatherModalOpen && (
        <PersonModal
          person={inspectedPerson}
          allPersons={persons}
          onClose={() => {
            setSelectedPersonId(null);
            setPersonHistory([]);
          }}
          onOpenAddChild={(fatherId) => {
            handleOpenAdd(fatherId);
          }}
          onOpenAddFather={(personId) => {
            handleOpenAddFather(personId);
          }}
          onOpenEdit={(p) => {
            setEditingPerson(p);
            setIsAddModalOpen(true);
          }}
          onOpenChangeRequest={(p) => {
            setChangeRequestTarget(p);
          }}
          onDeletePerson={(id) => {
            requestDeletePerson(id);
          }}
          onToggleGender={handleToggleGender}
          onNavigateToLineage={(id) => {
            setSelectedPersonId(id);
            setActiveTab('lineage');
          }}
          onNavigateToTreeBranch={(id) => {
            setSelectedPersonId(id);
            setActiveTab('tree');
          }}
          onPrintPerson={(id) => {
            setPrintPersonId(id);
          }}
          onSelectRelative={(id) => {
            if (selectedPersonId && selectedPersonId !== id) {
              setPersonHistory((prev) => [...prev, selectedPersonId]);
            }
            setSelectedPersonId(id);
          }}
          onBackToPrevious={
            previousPerson
              ? () => {
                  const prevId = personHistory[personHistory.length - 1];
                  setPersonHistory((prev) => prev.slice(0, -1));
                  setSelectedPersonId(prevId);
                }
              : undefined
          }
          previousPersonName={previousPerson?.fullName || null}
          onOpenMergeModal={(id) => handleOpenMergeModal(id)}
          onQuickAddChild={handleQuickAddChild}
          editingEnabled={isAdmin}
          isAdmin={isAdmin}
          getPerson={getPerson}
          getChildren={getChildren}
          getAncestors={getAncestors}
          getLineageString={getLineageString}
        />
      )}

      {/* 2. Add / Edit Person Modal */}
      {isAddModalOpen && isAdmin && (
        <AddPersonModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingPerson(null);
          }}
          onSubmit={handleCreatePerson}
          initialFatherId={initialFatherIdForAdd}
          persons={persons}
          editPerson={editingPerson}
          onUpdate={handleUpdatePerson}
        />
      )}

      {/* 3. Add Father / Ancestor Modal */}
      {isAddFatherModalOpen && targetPersonForAddFather && isAdmin && (
        <AddFatherModal
          isOpen={isAddFatherModalOpen}
          onClose={() => {
            setIsAddFatherModalOpen(false);
            setTargetPersonForAddFather(null);
          }}
          person={targetPersonForAddFather}
          persons={persons}
          treeRoots={treeRoots}
          onSelectTargetPerson={(p) => setTargetPersonForAddFather(p)}
          onOpenMergeModal={(id) => handleOpenMergeModal(id)}
          onSubmit={handleExecuteAddFather}
          currentFather={targetPersonForAddFather.fatherId ? getPerson(targetPersonForAddFather.fatherId) || null : null}
        />
      )}

      {/* 4. Merge Trees Modal */}
      {isMergeModalOpen && isAdmin && (
        <MergeTreesModal
          isOpen={isMergeModalOpen}
          onClose={() => setIsMergeModalOpen(false)}
          persons={persons}
          treeRoots={treeRoots}
          initialSourcePersonId={mergeSourcePersonId}
          onExecuteMerge={handleExecuteMerge}
          getChildren={getChildren}
          getPerson={getPerson}
          getAncestors={getAncestors}
        />
      )}

      {/* 5. Admin Settings & Lock Modal */}
      {isAdminModalOpen && (
        <AdminModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          settings={settings}
          isAdmin={isAdmin}
          onLoginSuccess={async () => {
            showToast('تم تسجيل دخول المشرف بنجاح');
            await fetchData(true);
          }}
          onLogout={handleLogoutAdmin}
          onSettingsUpdated={async () => {
            await fetchData(true);
          }}
          onDataResetOrRestored={async () => {
            await fetchData();
            showToast('تم تحديث بيانات الشجرة بنجاح');
          }}
          onOpenAddModal={() => handleOpenAdd(null)}
          onOpenAddRootAncestor={() => {
            const defaultRoot =
              (selectedTreeRootId && getPerson(selectedTreeRootId)) ||
              treeRoots[0] ||
              persons[0];
            if (defaultRoot) {
              handleOpenAddFather(defaultRoot.id);
            }
          }}
          onOpenMergeModal={() => setIsMergeModalOpen(true)}
          onNavigateToList={() => setActiveTab('list')}
        />
      )}

      {/* 6. Change Request / Feedback Modal */}
      {changeRequestTarget && (
        <ChangeRequestModal
          isOpen={!!changeRequestTarget}
          onClose={() => setChangeRequestTarget(null)}
          person={changeRequestTarget}
          onSubmitted={() => {
            showToast('تم إرسال اقتراحك للمشرف بنجاح');
          }}
        />
      )}

      {/* 7. Printable Lineage Certificate View */}
      {printPersonId && (
        <PrintView
          person={getPerson(printPersonId) || null}
          persons={persons}
          onClose={() => setPrintPersonId(null)}
          getAncestors={getAncestors}
          getChildren={getChildren}
          getLineageString={getLineageString}
        />
      )}

      {/* 8. Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!personToDelete}
        title="تأكيد حذف الفرد من الشجرة"
        message={personToDelete ? `هل أنت متأكد من رغبتك في حذف (${personToDelete.fullName}) من شجرة العائلة؟ سيتم إعادة ربط أي أبناء له بجدّهم تلقائياً.` : ''}
        confirmText="نعم، احذف الفرد"
        cancelText="إلغاء"
        isDestructive={true}
        onConfirm={confirmDeletePerson}
        onCancel={() => setPersonToDelete(null)}
      />

      {/* Offline Status Alert */}
      <OfflineBanner />
    </div>
  );
}
