import React, { useEffect, useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { TrainerForm } from '../components/trainers/TrainerForm';
import { TrainerCalendarView } from '../components/trainers/TrainerCalendarView';
import { apiClient } from '../lib/api-client';
import { Trainer } from '../types';
import { Plus, Edit, Trash2, Phone, MapPin, Filter, Calendar, BarChart3, X, CheckCircle } from 'lucide-react';
import { showToast } from '../components/common/Toast';

interface TrainerAnalytics {
  totalCourses: number;
  avgRating: number;
  totalBookings: number;
  cancelledBookings: number;
  cancellationRate: number;
  avgResponseTime: number | null;
  feedbackCount: number;
}

export const EnhancedTrainersPage: React.FC = () => {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [filteredTrainers, setFilteredTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHRDCModal, setShowHRDCModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [selectedTrainerForCalendar, setSelectedTrainerForCalendar] = useState<Trainer | null>(null);
  const [analytics, setAnalytics] = useState<TrainerAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExpertise, setSelectedExpertise] = useState('all');
  const [selectedState, setSelectedState] = useState('all');
  const [expertiseList, setExpertiseList] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);

  // Advanced search filters
  const [advancedFilters, setAdvancedFilters] = useState({
    expertise: '',
    hrdcStatus: 'all' as 'all' | 'certified' | 'expired' | 'none',
    state: '',
    availableFrom: '',
    availableTo: '',
  });

  // HRDC verification form
  const [hrdcForm, setHrdcForm] = useState({
    hrdcAccreditationId: '',
    hrdcAccreditationValidUntil: '',
    verified: false,
  });


  useEffect(() => {
    fetchTrainers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [trainers, searchTerm, selectedExpertise, selectedState]);

  const fetchTrainers = async () => {
    try {
      const response = await apiClient.getTrainers();
      const trainersData = response.trainers || [];

      // Map backend camelCase to frontend snake_case
      const mappedTrainers: Trainer[] = trainersData.map((t: any) => ({
        id: t.id,
        user_id: t.userId || null,
        email: t.email || '',
        full_name: t.fullName || '',
        phone: t.phoneNumber || null,
        specialization: Array.isArray(t.areasOfExpertise) && t.areasOfExpertise.length > 0 
          ? t.areasOfExpertise[0] 
          : null,
        bio: t.professionalBio || null,
        hourly_rate: t.hourlyRate ? parseFloat(t.hourlyRate) : null,
        hrdc_certified: !!t.hrdcAccreditationId,
        created_at: t.createdAt || new Date().toISOString(),
        updated_at: t.updatedAt || new Date().toISOString(),
        location: t.state || null,
        // Store HRDC data for use in modal
        hrdcAccreditationId: t.hrdcAccreditationId || null,
        hrdcAccreditationValidUntil: t.hrdcAccreditationValidUntil || null,
        // Store full areasOfExpertise array for filtering
        areasOfExpertise: Array.isArray(t.areasOfExpertise) ? t.areasOfExpertise : [],
        // Store custom_trainer_id for display and search
        custom_trainer_id: t.customTrainerId || null,
      } as Trainer & { hrdcAccreditationId?: string | null; hrdcAccreditationValidUntil?: string | Date | null; areasOfExpertise?: string[]; custom_trainer_id?: string | null }));

      setTrainers(mappedTrainers);

      // Extract expertise from areasOfExpertise
      const allExpertise: string[] = [];
      trainersData.forEach((t: any) => {
        if (Array.isArray(t.areasOfExpertise)) {
          allExpertise.push(...t.areasOfExpertise);
        }
      });
      const uniqueExpertise = [...new Set(allExpertise.filter(Boolean))];
      setExpertiseList(uniqueExpertise);

      const uniqueStates = [...new Set(trainersData.map((t: any) => t.state).filter(Boolean))];
      setStates(uniqueStates);
    } catch (error: any) {
      console.error('Error fetching trainers:', error);
      showToast(error.message || 'Error fetching trainers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...trainers];

    if (searchTerm) {
      filtered = filtered.filter(trainer => {
        const searchLower = searchTerm.toLowerCase();
        const customTrainerId = (trainer as any).custom_trainer_id || '';
        return (
          trainer.full_name?.toLowerCase().includes(searchLower) ||
          trainer.email?.toLowerCase().includes(searchLower) ||
          trainer.phone?.includes(searchTerm) ||
          customTrainerId.toLowerCase().includes(searchLower)
        );
      });
    }

    if (selectedExpertise !== 'all') {
      filtered = filtered.filter(trainer => {
        // Check if selected expertise is in the trainer's areasOfExpertise array
        const areasOfExpertise = (trainer as any).areasOfExpertise || [];
        if (Array.isArray(areasOfExpertise) && areasOfExpertise.length > 0) {
          return areasOfExpertise.includes(selectedExpertise);
        }
        // Fallback to specialization (first element) for backward compatibility
        return trainer.specialization === selectedExpertise;
      });
    }

    if (selectedState !== 'all') {
      filtered = filtered.filter(trainer => (trainer as any).location === selectedState);
    }

    setFilteredTrainers(filtered);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trainer?')) return;

    try {
      await apiClient.deleteTrainer(id);
      showToast('Trainer deleted successfully', 'success');
      fetchTrainers();
    } catch (error: any) {
      showToast(error.message || 'Error deleting trainer', 'error');
    }
  };

  const handleHRDCVerification = async () => {
    if (!selectedTrainer) return;

    try {
      await apiClient.verifyHRDC(selectedTrainer.id, {
        hrdcAccreditationId: hrdcForm.hrdcAccreditationId || undefined,
        hrdcAccreditationValidUntil: hrdcForm.hrdcAccreditationValidUntil || undefined,
        verified: hrdcForm.verified,
      });
      showToast('HRDC certification updated successfully', 'success');
      setShowHRDCModal(false);
      setHrdcForm({ hrdcAccreditationId: '', hrdcAccreditationValidUntil: '', verified: false });
      fetchTrainers();
    } catch (error: any) {
      showToast(error.message || 'Error updating HRDC certification', 'error');
    }
  };


  const handleViewAnalytics = async (trainer: Trainer) => {
    setSelectedTrainer(trainer);
    setShowAnalyticsModal(true);
    setAnalyticsLoading(true);

    try {
      const data = await apiClient.getTrainerAnalytics(trainer.id);
      setAnalytics(data);
    } catch (error: any) {
      showToast(error.message || 'Error fetching analytics', 'error');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleAdvancedSearch = async () => {
    try {
      const params: any = {};
      if (advancedFilters.expertise) params.expertise = advancedFilters.expertise;
      if (advancedFilters.hrdcStatus !== 'all') params.hrdcStatus = advancedFilters.hrdcStatus;
      if (advancedFilters.state) params.state = advancedFilters.state;
      if (advancedFilters.availableFrom) params.availableFrom = advancedFilters.availableFrom;
      if (advancedFilters.availableTo) params.availableTo = advancedFilters.availableTo;

      const response = await apiClient.searchTrainersAdvanced(params);
      const trainersData = response.trainers || [];

      const mappedTrainers: Trainer[] = trainersData.map((t: any) => ({
        id: t.id,
        user_id: t.userId || null,
        email: t.email || '',
        full_name: t.fullName || '',
        phone: t.phoneNumber || null,
        specialization: Array.isArray(t.areasOfExpertise) && t.areasOfExpertise.length > 0 
          ? t.areasOfExpertise[0] 
          : null,
        bio: t.professionalBio || null,
        hourly_rate: t.hourlyRate ? parseFloat(t.hourlyRate) : null,
        hrdc_certified: !!t.hrdcAccreditationId,
        created_at: t.createdAt || new Date().toISOString(),
        updated_at: t.updatedAt || new Date().toISOString(),
        location: t.state || null,
        // Store HRDC data for use in modal
        hrdcAccreditationId: t.hrdcAccreditationId || null,
        hrdcAccreditationValidUntil: t.hrdcAccreditationValidUntil || null,
        // Store custom_trainer_id for display and search
        custom_trainer_id: t.customTrainerId || null,
      } as Trainer & { hrdcAccreditationId?: string | null; hrdcAccreditationValidUntil?: string | Date | null; custom_trainer_id?: string | null }));

      setFilteredTrainers(mappedTrainers);
      showToast(`Found ${mappedTrainers.length} trainer(s)`, 'success');
    } catch (error: any) {
      showToast(error.message || 'Error searching trainers', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Trainers Management</h1>
        <div className="flex items-center space-x-3">
          <Button variant="secondary" onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}>
            <Filter size={18} className="mr-2" />
            Advanced Search
          </Button>
          <Button variant="primary" onClick={() => setShowAddModal(true)}>
            <Plus size={18} className="mr-2" />
            Add Trainer
          </Button>
        </div>
      </div>

      {/* Advanced Search Panel */}
      {showAdvancedSearch && (
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Advanced Search</h2>
              <button onClick={() => setShowAdvancedSearch(false)}>
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input
                label="Expertise"
                value={advancedFilters.expertise}
                onChange={(e) => setAdvancedFilters({ ...advancedFilters, expertise: e.target.value })}
                placeholder="e.g., Leadership"
              />
              <Select
                label="HRDC Status"
                value={advancedFilters.hrdcStatus}
                onChange={(e) => setAdvancedFilters({ ...advancedFilters, hrdcStatus: e.target.value as any })}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'certified', label: 'Certified' },
                  { value: 'expired', label: 'Expired' },
                  { value: 'none', label: 'None' },
                ]}
              />
              <Select
                label="State"
                value={advancedFilters.state}
                onChange={(e) => setAdvancedFilters({ ...advancedFilters, state: e.target.value })}
                options={[
                  { value: '', label: 'All States' },
                  ...states.map(s => ({ value: s, label: s })),
                ]}
              />
              <Input
                label="Available From"
                type="date"
                value={advancedFilters.availableFrom}
                onChange={(e) => setAdvancedFilters({ ...advancedFilters, availableFrom: e.target.value })}
              />
              <Input
                label="Available To"
                type="date"
                value={advancedFilters.availableTo}
                onChange={(e) => setAdvancedFilters({ ...advancedFilters, availableTo: e.target.value })}
              />
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="primary" onClick={handleAdvancedSearch}>
                Search
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or Trainer ID..."
            />
          </div>
          <Select
            value={selectedExpertise}
            onChange={(e) => setSelectedExpertise(e.target.value)}
            options={[
              { value: 'all', label: 'All Expertise' },
              ...expertiseList.map(e => ({ value: e, label: e })),
            ]}
          />
          <Select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            options={[
              { value: 'all', label: 'All States' },
              ...states.map(s => ({ value: s, label: s })),
            ]}
          />
        </div>
      </Card>

      {/* Trainers Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trainer ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specialization</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HRDC</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTrainers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No trainers found
                  </td>
                </tr>
              ) : (
                filteredTrainers.map((trainer) => (
                  <tr key={trainer.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{trainer.full_name}</div>
                      {trainer.email ? (
                        <a
                          href={`mailto:${trainer.email}`}
                          className="text-sm text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
                          title={`Send email to ${trainer.email}`}
                        >
                          {trainer.email}
                        </a>
                      ) : (
                        <div className="text-sm text-gray-500">N/A</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700 font-mono">
                        {(trainer as any).custom_trainer_id || 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        {trainer.phone && (
                          <div className="flex items-center">
                            <Phone size={14} className="mr-1" />
                            {trainer.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {trainer.specialization || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {(trainer as any).location ? (
                        <div className="flex items-center">
                          <MapPin size={14} className="mr-1" />
                          {(trainer as any).location}
                        </div>
                      ) : 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      {(trainer as any).hrdcAccreditationId ? (
                        <div>
                          <Badge variant="success" className="mb-1">Certified</Badge>
                          <div className="text-xs text-gray-600 mt-1">
                            {(trainer as any).hrdcAccreditationId}
                          </div>
                        </div>
                      ) : (
                        <Badge variant="default">Not Certified</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleViewAnalytics(trainer)}
                          title="View Analytics"
                        >
                          <BarChart3 size={16} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedTrainer(trainer);
                            // Populate form with existing HRDC data
                            const validUntil = (trainer as any).hrdcAccreditationValidUntil;
                            let formattedDate = '';
                            if (validUntil) {
                              // Convert date to YYYY-MM-DD format for date input
                              const date = new Date(validUntil);
                              if (!isNaN(date.getTime())) {
                                formattedDate = date.toISOString().split('T')[0];
                              }
                            }
                            setHrdcForm({
                              hrdcAccreditationId: (trainer as any).hrdcAccreditationId || '',
                              hrdcAccreditationValidUntil: formattedDate,
                              verified: trainer.hrdc_certified || false,
                            });
                            setShowHRDCModal(true);
                          }}
                          title="Verify HRDC Certification"
                        >
                          <CheckCircle size={16} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedTrainerForCalendar(trainer);
                            setShowCalendarModal(true);
                          }}
                          title="View Calendar & Create Availability"
                        >
                          <Calendar size={16} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingTrainer(trainer);
                            setShowEditModal(true);
                          }}
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDelete(trainer.id)}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Trainer Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Trainer">
        <TrainerForm
          onSubmit={async (data) => {
            try {
              await apiClient.addTrainer(data);
              showToast('Trainer added successfully', 'success');
              setShowAddModal(false);
              fetchTrainers();
            } catch (error: any) {
              showToast(error.message || 'Error adding trainer', 'error');
            }
          }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>

      {/* Edit Trainer Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Trainer">
        {editingTrainer && (
          <TrainerForm
            trainer={editingTrainer}
            onSubmit={async (data) => {
              try {
                await apiClient.updateTrainer(editingTrainer.id, data);
                showToast('Trainer updated successfully', 'success');
                setShowEditModal(false);
                setEditingTrainer(null);
                fetchTrainers();
              } catch (error: any) {
                showToast(error.message || 'Error updating trainer', 'error');
              }
            }}
            onCancel={() => {
              setShowEditModal(false);
              setEditingTrainer(null);
            }}
          />
        )}
      </Modal>

      {/* HRDC Verification Modal */}
      <Modal isOpen={showHRDCModal} onClose={() => setShowHRDCModal(false)} title="Verify HRDC Certification">
        <div className="space-y-4">
          <Input
            label="HRDC Accreditation ID"
            value={hrdcForm.hrdcAccreditationId}
            onChange={(e) => setHrdcForm({ ...hrdcForm, hrdcAccreditationId: e.target.value })}
            placeholder="e.g., HRDC-12345"
          />
          <Input
            label="Valid Until"
            type="date"
            value={hrdcForm.hrdcAccreditationValidUntil}
            onChange={(e) => setHrdcForm({ ...hrdcForm, hrdcAccreditationValidUntil: e.target.value })}
          />
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="verified"
              checked={hrdcForm.verified}
              onChange={(e) => setHrdcForm({ ...hrdcForm, verified: e.target.checked })}
              className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
            />
            <label htmlFor="verified" className="text-sm text-gray-700">
              Mark as verified
            </label>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="secondary" onClick={() => setShowHRDCModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleHRDCVerification}>
              <CheckCircle size={18} className="mr-2" />
              Verify
            </Button>
          </div>
        </div>
      </Modal>

      {/* Calendar View Modal */}
      <Modal
        isOpen={showCalendarModal}
        onClose={() => {
          setShowCalendarModal(false);
          setSelectedTrainerForCalendar(null);
        }}
        title={selectedTrainerForCalendar ? `Calendar - ${selectedTrainerForCalendar.full_name}` : 'Trainer Calendar'}
        size="xl"
      >
        {selectedTrainerForCalendar && (
          <TrainerCalendarView
            trainerId={selectedTrainerForCalendar.id}
            trainerName={selectedTrainerForCalendar.full_name || 'Unknown'}
            onClose={() => {
              setShowCalendarModal(false);
              setSelectedTrainerForCalendar(null);
            }}
          />
        )}
      </Modal>

      {/* Analytics Modal */}
      <Modal
        isOpen={showAnalyticsModal}
        onClose={() => {
          setShowAnalyticsModal(false);
          setSelectedTrainer(null);
          setAnalytics(null);
        }}
        title={`Analytics - ${selectedTrainer?.full_name || ''}`}
      >
        {analyticsLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : analytics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <div className="p-4">
                  <p className="text-sm text-gray-600">Total Courses</p>
                  <p className="text-2xl font-bold text-gray-800">{analytics.totalCourses}</p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-sm text-gray-600">Average Rating</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {analytics.avgRating ? analytics.avgRating.toFixed(1) : 'N/A'}
                  </p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-sm text-gray-600">Total Bookings</p>
                  <p className="text-2xl font-bold text-gray-800">{analytics.totalBookings}</p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-sm text-gray-600">Cancellation Rate</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {analytics.cancellationRate.toFixed(1)}%
                  </p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-sm text-gray-600">Feedback Count</p>
                  <p className="text-2xl font-bold text-gray-800">{analytics.feedbackCount}</p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-sm text-gray-600">Avg Response Time</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {analytics.avgResponseTime ? `${analytics.avgResponseTime}h` : 'N/A'}
                  </p>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No analytics data available</p>
        )}
      </Modal>
    </div>
  );
};
