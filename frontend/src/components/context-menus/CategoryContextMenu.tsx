import { useState } from 'react';
import { MenuOverlay, menuDivider } from './MenuOverlay';
import type { Category } from '../../types';
import { useStreamStore } from '../../stores/streamStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import ConfirmModal from '../modals/ConfirmModal';

export interface CategoryMenuTarget {
  category: Category;
  x: number;
  y: number;
}

interface Props {
  hubId: string;
  target: CategoryMenuTarget;
  isCollapsed: boolean;
  canManageChannels: boolean;
  onClose: () => void;
  onToggleCollapse: (catId: string) => void;
  onCollapseAll: () => void;
  onEditCategory: (category: Category) => void;
  onCreateTextChannel: (categoryId: string) => void;
  onCreateVoiceChannel: (categoryId: string) => void;
}

export default function CategoryContextMenu({
  hubId,
  target,
  isCollapsed,
  canManageChannels,
  onClose,
  onToggleCollapse,
  onCollapseAll,
  onEditCategory,
  onCreateTextChannel,
  onCreateVoiceChannel,
}: Props) {
  const { category, x, y } = target;
  const deleteCategory = useStreamStore((s) => s.deleteCategory);
  const developerMode = useAppSettingsStore((s) => s.developerMode);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const copyCategoryId = () => {
    void navigator.clipboard.writeText(category.id);
    onClose();
  };

  const handleDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteCategory(hubId, category.id);
      setDeleteOpen(false);
      onClose();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete category');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <MenuOverlay x={x} y={y} onClose={onClose}>
        <div className="rift-context-menu-shell min-w-[200px] text-[13px] text-[#dbdee1]">
          {/* Collapse / Expand */}
          <button
            type="button"
            onClick={() => {
              onToggleCollapse(category.id);
              onClose();
            }}
            className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
          >
            <span className="w-4 shrink-0" aria-hidden />
            {isCollapsed ? 'Expand Category' : 'Collapse Category'}
          </button>

          <button
            type="button"
            onClick={() => {
              onCollapseAll();
              onClose();
            }}
            className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
          >
            <span className="w-4 shrink-0" aria-hidden />
            Collapse All Categories
          </button>

          {/* Manage options */}
          {canManageChannels && (
            <>
              {menuDivider()}
              <button
                type="button"
                onClick={() => {
                  onEditCategory(category);
                  onClose();
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
              >
                <span className="w-4 shrink-0" aria-hidden />
                Edit Category
              </button>

              {menuDivider()}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateTextChannel(category.id);
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
              >
                <span className="w-4 shrink-0" aria-hidden />
                Create Text Channel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateVoiceChannel(category.id);
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
              >
                <span className="w-4 shrink-0" aria-hidden />
                Create Voice Channel
              </button>

              {menuDivider()}

              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#d83c3e]/20 text-[#d83c3e] text-left w-[calc(100%-8px)]"
              >
                <span className="w-4 shrink-0" aria-hidden />
                Delete Category
              </button>
            </>
          )}

          {developerMode && (
            <>
              {menuDivider()}
              <button
                type="button"
                onClick={copyCategoryId}
                className="flex items-center justify-between gap-2 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
              >
                <span>Copy Category ID</span>
                <span className="text-[10px] font-mono font-semibold px-1 py-0.5 rounded bg-[#1e1f22] border border-[#3f4147] text-[#b5bac1]">ID</span>
              </button>
            </>
          )}
        </div>
      </MenuOverlay>

      <ConfirmModal
        isOpen={deleteOpen}
        title="Delete Category"
        description={`Delete "${category.name}"? Channels inside will become uncategorized. This cannot be undone.`}
        confirmText="Delete Category"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        loading={deleteBusy}
      >
        {deleteError && (
          <p className="text-red-400 text-sm mt-2">{deleteError}</p>
        )}
      </ConfirmModal>
    </>
  );
}
