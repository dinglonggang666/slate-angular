import { ChangeDetectionStrategy, Component, ComponentRef, Input, OnChanges, OnInit } from "@angular/core";
import { SlateBlockCardComponent } from "../block-card/block-card.component";
import { ViewContainerItem } from '../../view/container-item';
import { Descendant, Editor, Range, Element } from "slate";
import { SlateChildrenContext, SlateElementContext, SlateTextContext, SlateViewContext } from "../../view/context";
import { AngularEditor } from "../../plugins/angular-editor";
import { NODE_TO_INDEX, NODE_TO_PARENT } from "../../utils/weak-maps";
import { SlateDefaultElementComponent } from "../element/default-element.component";
import { BaseElementComponent, BaseTextComponent } from "../../view/base";
import { SlateDefaultTextComponent } from "../text/default-text.component";
import { SlateVoidTextComponent } from "../text/void-text.component";
import { isDecoratorRangeListEqual } from "../../utils";
import { ViewType } from "../../types/view";

@Component({
    selector: 'slate-descendant',
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SlateDescendantComponent extends ViewContainerItem<SlateElementContext | SlateTextContext, BaseElementComponent | BaseTextComponent> implements OnInit, OnChanges {
    blockCardComponentRef: ComponentRef<SlateBlockCardComponent>;

    @Input() descendant: Descendant;

    @Input() context: SlateChildrenContext;

    @Input() viewContext: SlateViewContext;

    @Input() index: number;

    get rootNodes(): HTMLElement[] {
        if (this.blockCardComponentRef) {
            return [this.blockCardComponentRef.instance.nativeElement];
        }
        return super.rootNodes;
    }

    ngOnInit() {
        NODE_TO_INDEX.set(this.descendant, this.index);
        NODE_TO_PARENT.set(this.descendant, this.context.parent);
        this.createView();
        this.createBlockCard();
    }

    destroyView() {
        super.destroyView();
        this.destroyBlockCard();
    }

    ngOnChanges() {
        if (!this.initialized) {
            return;
        }
        NODE_TO_INDEX.set(this.descendant, this.index);
        NODE_TO_PARENT.set(this.descendant, this.context.parent);
        this.updateView();
        this.createBlockCard();
    }

    destroyBlockCard() {
        if (this.blockCardComponentRef) {
            this.blockCardComponentRef.destroy();
            this.blockCardComponentRef = null;
        }
    }

    createBlockCard() {
        const isBlockCard = this.viewContext.editor.isBlockCard(this.descendant);
        if (!isBlockCard || this.blockCardComponentRef) {
            return;
        }
        const rootNodes = this.rootNodes;
        const componentFactory = this.componentFactoryResolver.resolveComponentFactory(SlateBlockCardComponent);
        this.blockCardComponentRef = this.viewContainerRef.createComponent<SlateBlockCardComponent>(componentFactory, null, null);
        this.blockCardComponentRef.instance.initializeCenter(rootNodes);
    }

    getCommonContext(): { selection: Range; decorations: Range[] } {
        const path = AngularEditor.findPath(this.viewContext.editor, this.context.parent);
        const p = path.concat(this.index);
        const range = Editor.range(this.viewContext.editor, p);
        const sel = this.context.selection && Range.intersection(range, this.context.selection);
        const ds = this.context.decorate([this.descendant, p]);

        for (const dec of this.context.decorations) {
            const d = Range.intersection(dec, range);
            if (d) {
                ds.push(d);
            }
        }
        return { selection: sel, decorations: ds };
    }

    getContext(): SlateElementContext | SlateTextContext {
        if (Element.isElement(this.descendant)) {
            const computedContext = this.getCommonContext();
            const key = AngularEditor.findKey(this.viewContext.editor, this.descendant);
            const isInline = this.viewContext.editor.isInline(this.descendant);
            const isVoid = this.viewContext.editor.isVoid(this.descendant);
            const elementContext: SlateElementContext = {
                element: this.descendant,
                ...computedContext,
                attributes: {
                    'data-slate-node': 'element',
                    'data-slate-key': key.id
                },
                decorate: this.context.decorate
            }
            if (isInline) {
                elementContext.attributes['data-slate-inline'] = true;
            }
            if (isVoid) {
                elementContext.attributes['data-slate-void'] = true;
                elementContext.attributes.contenteditable = false;
            }
            return elementContext;
        } else {
            const computedContext = this.getCommonContext();
            const isLeafBlock = AngularEditor.isLeafBlock(this.viewContext.editor, this.context.parent);
            const textContext: SlateTextContext = {
                decorations: computedContext.decorations,
                isLast: isLeafBlock && this.index === this.context.parent.children.length - 1,
                parent: this.context.parent,
                text: this.descendant
            }
            return textContext;
        }
    }

    getViewType(): ViewType {
        if (Element.isElement(this.descendant)) {
            return (this.viewContext.renderElement && this.viewContext.renderElement(this.descendant)) || SlateDefaultElementComponent;
        } else {
            const isVoid = this.viewContext.editor.isVoid(this.context.parent);
            return isVoid ? SlateVoidTextComponent : (this.viewContext.renderText && this.viewContext.renderText(this.descendant)) || SlateDefaultTextComponent;
        }
    }

    memoizedElementContext(prev: SlateElementContext, next: SlateElementContext) {
        return (
            prev.element === next.element &&
            prev.decorate === next.decorate &&
            isDecoratorRangeListEqual(prev.decorations, next.decorations) &&
            (prev.selection === next.selection ||
                (!!prev.selection &&
                    !!next.selection &&
                    Range.equals(prev.selection, next.selection)))
        )
    }

    memoizedTextContext(prev: SlateTextContext, next: SlateTextContext) {
        return (
            next.parent === prev.parent &&
            next.isLast === prev.isLast &&
            next.text === prev.text &&
            isDecoratorRangeListEqual(next.decorations, prev.decorations)
        )
    }

    memoizedContext(prev: SlateElementContext | SlateTextContext, next: SlateElementContext | SlateTextContext): boolean {
        if (Element.isElement(this.descendant)) {
            return this.memoizedElementContext(prev as SlateElementContext, next as SlateElementContext);
        } else {
            return this.memoizedTextContext(prev as SlateTextContext, next as SlateTextContext);
        }
    }
}