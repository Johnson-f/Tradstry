"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import { useGraphQL } from "@tradstry/app-ui/lib/client";
import * as playbookService from "@tradstry/app-ui/lib/service/playbook";
import type {
	CreatePlaybookInput,
	PlaybookWithStats,
	UpdatePlaybookInput,
} from "@tradstry/app-ui/lib/types/playbook";
import { useAuth } from "@tradstry/app-ui/platform";
import { optimisticRemove, optimisticUpdate } from "./optimistic";

const PLAYBOOK_KEY = ["playbooks"] as const;

export function usePlaybooks() {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	const workspace = useActiveWorkspace();

	return useQuery<PlaybookWithStats[]>({
		queryKey: [...PLAYBOOK_KEY, workspace?.id ?? null],
		queryFn: () => {
			if (!workspace) throw new Error("Select a workspace first");
			return playbookService.fetchPlaybooks(fetcher, workspace.id);
		},
		enabled: isLoaded && isSignedIn && !!workspace,
	});
}

export function usePlaybook(id: string | null) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();

	return useQuery<PlaybookWithStats | null>({
		queryKey: [...PLAYBOOK_KEY, id],
		queryFn: () => {
			if (!id) throw new Error("Playbook id is required");
			return playbookService.fetchPlaybook(fetcher, id);
		},
		enabled: isLoaded && isSignedIn && !!id,
	});
}

export function useStrategyLibraryPlaybooks() {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	const workspace = useActiveWorkspace();
	return useQuery<PlaybookWithStats[]>({
		queryKey: [...PLAYBOOK_KEY, "library", workspace?.id ?? null],
		queryFn: () => {
			if (!workspace) throw new Error("Select a workspace first");
			return playbookService.fetchStrategyLibraryPlaybooks(
				fetcher,
				workspace.id,
			);
		},
		enabled: isLoaded && isSignedIn && !!workspace,
	});
}

export function useCreatePlaybook() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	const workspace = useActiveWorkspace();

	return useMutation({
		mutationFn: (input: Omit<CreatePlaybookInput, "workspaceId">) => {
			if (!workspace) throw new Error("Select a workspace first");
			return playbookService.createPlaybook(fetcher, {
				...input,
				workspaceId: workspace.id,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: PLAYBOOK_KEY });
		},
	});
}

export function useUpdatePlaybook() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();

	type UpdateVars = { id: string; input: UpdatePlaybookInput };
	return useMutation({
		mutationFn: ({ id, input }: UpdateVars) =>
			playbookService.updatePlaybook(fetcher, id, input),
		...optimisticUpdate<UpdateVars, PlaybookWithStats>(
			queryClient,
			PLAYBOOK_KEY,
			(vars) => vars.id,
			(entity, { input }) => ({ ...entity, ...input }) as PlaybookWithStats,
		),
	});
}

export function useDeletePlaybook() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => playbookService.deletePlaybook(fetcher, id),
		...optimisticRemove<string>(queryClient, PLAYBOOK_KEY, (id) => id),
	});
}

export function useSetPlaybookApplicability() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			availability,
			workspaceIds,
		}: {
			id: string;
			availability: "all" | "selected";
			workspaceIds: string[];
		}) =>
			playbookService.setPlaybookApplicability(fetcher, id, {
				availability,
				workspaceIds,
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAYBOOK_KEY }),
	});
}
