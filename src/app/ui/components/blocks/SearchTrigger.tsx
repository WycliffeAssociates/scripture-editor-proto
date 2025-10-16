import {
  ActionIcon,
  Button,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  CaseSensitive,
  ChevronLeft,
  ChevronRight,
  Search as IconSearch,
  Replace,
  ReplaceAll,
  WholeWord,
} from "lucide-react";
import {useState} from "react";
import {useWorkspaceContext} from "@/app/ui/contexts/WorkspaceContext";

// export function SearchInput() {
//   const {search} = useWorkspaceContext();
//   const {
//     searchTerm,
//     setSearch,
//     replaceTerm,
//     setReplaceTerm,
//     searchProject,
//     nextMatch,
//     prevMatch,
//     replaceCurrentMatch,
//     replaceAllInChapter,
//     currentMatchIndex,
//     totalMatches,
//     hasNext,
//     hasPrev,
//   } = search;
//   // debugger;
//   const [matchCase, setMatchCase] = useState(false);
//   const [wholeWord, setWholeWord] = useState(false);
//   const [popoverOpened, setPopoverOpened] = useState(false);

//   return (
//     <Popover
//       opened={popoverOpened}
//       onClose={() => setPopoverOpened(false)}
//       onDismiss={() => setPopoverOpened(false)}
//       position="bottom-end"
//       withArrow
//       trapFocus
//     >
//       <Popover.Target>
//         <ActionIcon
//           variant="subtle"
//           onClick={() => setPopoverOpened((o) => !o)}
//         >
//           <IconSearch size={16} />
//         </ActionIcon>
//       </Popover.Target>
//       <Popover.Dropdown>
//         <Stack gap={4} p="xs">
//           {/* Search bar */}
//           <Group gap={4} align="center" wrap="nowrap">
//             <TextInput
//               value={searchTerm}
//               onChange={(e) => setSearch(e.currentTarget.value)}
//               onKeyDown={(e) => e.key === "Enter" && searchProject()}
//               placeholder="Find"
//               leftSection={<IconSearch size={16} />}
//               rightSectionWidth={64}
//               rightSection={
//                 <Group gap={2} align="center">
//                   <Tooltip label="Match Case">
//                     <ActionIcon
//                       variant={matchCase ? "filled" : "subtle"}
//                       onClick={() => setMatchCase((v) => !v)}
//                     >
//                       <CaseSensitive size={16} />
//                     </ActionIcon>
//                   </Tooltip>
//                   <Tooltip label="Match Whole Word">
//                     <ActionIcon
//                       variant={wholeWord ? "filled" : "subtle"}
//                       onClick={() => setWholeWord((v) => !v)}
//                     >
//                       <WholeWord size={16} />
//                     </ActionIcon>
//                   </Tooltip>
//                 </Group>
//               }
//               w={250}
//               onFocus={() => setPopoverOpened(true)}
//             />

//             <Group gap={2}>
//               <ActionIcon
//                 onClick={prevMatch}
//                 disabled={!hasPrev}
//                 variant="subtle"
//               >
//                 <ChevronLeft size={16} />
//               </ActionIcon>
//               <ActionIcon
//                 onClick={nextMatch}
//                 disabled={!hasNext}
//                 variant="subtle"
//               >
//                 <ChevronRight size={16} />
//               </ActionIcon>
//             </Group>

//             <Text size="sm" c="dimmed" w={70} ta="center">
//               {totalMatches > 0
//                 ? `${currentMatchIndex + 1} of ${totalMatches}`
//                 : "No results"}
//             </Text>
//           </Group>

//           {/* Replace bar */}
//           <Group gap={4} align="center" wrap="nowrap">
//             <TextInput
//               value={replaceTerm}
//               onChange={(e) => setReplaceTerm(e.currentTarget.value)}
//               placeholder="Replace"
//               leftSection={<Replace size={16} />}
//               w={250}
//             />

//             <Group gap={4}>
//               <Tooltip label="Replace">
//                 <ActionIcon
//                   onClick={replaceCurrentMatch}
//                   variant="subtle"
//                   disabled={!totalMatches}
//                 >
//                   <Replace size={16} />
//                 </ActionIcon>
//               </Tooltip>

//               <Tooltip label="Replace All in Chapter">
//                 <ActionIcon
//                   onClick={replaceAllInChapter}
//                   variant="subtle"
//                   disabled={!totalMatches}
//                 >
//                   <ReplaceAll size={16} />
//                 </ActionIcon>
//               </Tooltip>
//             </Group>
//           </Group>
//         </Stack>
//       </Popover.Dropdown>
//     </Popover>
//   );
// }

export function SearchInput() {
  const {search} = useWorkspaceContext();
  return (
    <ActionIcon
      variant="subtle"
      onClick={() => {
        search.setIsSearchPaneOpen((o) => !o);
        setTimeout(() => {
          const input = document.querySelector(
            'input[data-js="search-input"]'
          ) as HTMLInputElement;
          if (input) {
            input.focus();
          }
        }, 50);
      }}
    >
      <IconSearch size={16} />
    </ActionIcon>
  );
}
