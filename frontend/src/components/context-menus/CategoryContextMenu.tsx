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
  const menuItemClassName = 'mx-1.5 flex w-[calc(100%-12px)] items-center rounded-[6px] px-2.5 py-[7px] text-left text-[13px] text-[#dbdee1] transition-colors hover:bg-[#232428]';

  return (
    <>
      <MenuOverlay x={x} y={y} onClose={onClose}>
        <div className="rift-context-menu-shell text-[13px] text-[#dbdee1]">
          {/* Collapse / Expand */}
          <button
            type="button"
            onClick={() => {
              onToggleCollapse(category.id);
              onClose();
            }}
            className={menuItemClassName}
          >
            {isCollapsed ? 'Expand Category' : 'Collapse Category'}
          </button>

          <button
            type="button"
            onClick={() => {
              onCollapseAll();
              onClose();
            }}
            className={menuItemClassName}
          >
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
                className={menuItemClassName}
              >
                Edit Category
              </button>

              {menuDivider()}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateTextChannel(category.id);
                }}
                className={menuItemClassName}
              >
                Create Text Channel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateVoiceChannel(category.id);
                }}
                className={menuItemClassName}
              >
                Create Voice Channel
              </button>

              {menuDivider()}

              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className={`${menuItemClassName} text-[#d83c3e] hover:bg-[#d83c3e]/20`}
              >
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
                className={`${menuItemClassName} justify-between gap-2`}
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
